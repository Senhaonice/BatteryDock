$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class BatteryDockTaskbar {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT monitor, work; public uint flags; }
  [StructLayout(LayoutKind.Sequential)] public struct APPBARDATA {
    public uint cbSize; public IntPtr hWnd; public uint uCallbackMessage, uEdge; public RECT rc; public IntPtr lParam;
  }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string name);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle, out RECT rect);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr handle, uint flags);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
  public static bool ReadRect(IntPtr handle, out RECT rect, out RECT monitor) {
    IntPtr previous = SetThreadDpiAwarenessContext(new IntPtr(-4));
    monitor = new RECT();
    try {
      MONITORINFO info = new MONITORINFO(); info.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
      bool ok = GetWindowRect(handle, out rect) && GetMonitorInfo(MonitorFromWindow(handle, 2), ref info);
      monitor = info.monitor;
      return ok;
    }
    finally { if (previous != IntPtr.Zero) SetThreadDpiAwarenessContext(previous); }
  }
  [DllImport("shell32.dll")] public static extern UIntPtr SHAppBarMessage(uint message, ref APPBARDATA data);
}
'@
$lastTaskbarState = ''
while ($true) {
  $taskbarHandle = [BatteryDockTaskbar]::FindWindow('Shell_TrayWnd', $null)
  $taskbarRect = New-Object BatteryDockTaskbar+RECT
  $taskbarMonitor = New-Object BatteryDockTaskbar+RECT
  if ($taskbarHandle -ne [IntPtr]::Zero -and [BatteryDockTaskbar]::ReadRect($taskbarHandle, [ref]$taskbarRect, [ref]$taskbarMonitor)) {
    $taskbarData = New-Object BatteryDockTaskbar+APPBARDATA
    $taskbarData.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($taskbarData)
    $taskbarData.hWnd = $taskbarHandle
    $taskbarFlags = [BatteryDockTaskbar]::SHAppBarMessage(4, [ref]$taskbarData).ToUInt64()
    $taskbarState = @{ autoHide = (($taskbarFlags -band 1) -ne 0); rect = @{ x = $taskbarRect.Left; y = $taskbarRect.Top; width = $taskbarRect.Right - $taskbarRect.Left; height = $taskbarRect.Bottom - $taskbarRect.Top }; bounds = @{ x = $taskbarMonitor.Left; y = $taskbarMonitor.Top; width = $taskbarMonitor.Right - $taskbarMonitor.Left; height = $taskbarMonitor.Bottom - $taskbarMonitor.Top } } | ConvertTo-Json -Compress
    if ($taskbarState -ne $lastTaskbarState) {
      [Console]::Out.WriteLine($taskbarState)
      [Console]::Out.Flush()
      $lastTaskbarState = $taskbarState
    }
  }
  Start-Sleep -Milliseconds 150
}

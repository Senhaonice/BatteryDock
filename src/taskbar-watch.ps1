$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class BatteryDockTaskbar {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT monitor, work; public uint flags; }
  [StructLayout(LayoutKind.Sequential)] public struct APPBARDATA {
    public uint cbSize; public IntPtr hWnd; public uint uCallbackMessage, uEdge; public RECT rc; public IntPtr lParam;
  }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string name);
  public delegate bool EnumWindowProc(IntPtr handle, IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowProc callback, IntPtr parameter);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr handle, StringBuilder name, int length);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr handle);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr handle, uint attribute, out uint value, uint size);
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
  public static bool ReadOverflow(out RECT rect) {
    RECT found = new RECT();
    bool visible = false;
    EnumWindows(delegate(IntPtr handle, IntPtr parameter) {
      if (!IsWindowVisible(handle)) return true;
      StringBuilder name = new StringBuilder(128);
      GetClassName(handle, name, name.Capacity);
      string cls = name.ToString();
      if (cls != "NotifyIconOverflowWindow" && cls != "TopLevelWindowForOverflowXamlIsland") return true;
      uint cloaked;
      if (DwmGetWindowAttribute(handle, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      RECT bounds, monitor;
      if (!ReadRect(handle, out bounds, out monitor) || bounds.Right <= bounds.Left || bounds.Bottom <= bounds.Top) return true;
      found = bounds;
      visible = true;
      return false;
    }, IntPtr.Zero);
    rect = found;
    return visible;
  }
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
    $overflowRect = New-Object BatteryDockTaskbar+RECT
    $overflow = $null
    if ([BatteryDockTaskbar]::ReadOverflow([ref]$overflowRect)) {
      $overflow = @{ x = $overflowRect.Left; y = $overflowRect.Top; width = $overflowRect.Right - $overflowRect.Left; height = $overflowRect.Bottom - $overflowRect.Top }
    }
    $taskbarState = @{ autoHide = (($taskbarFlags -band 1) -ne 0); rect = @{ x = $taskbarRect.Left; y = $taskbarRect.Top; width = $taskbarRect.Right - $taskbarRect.Left; height = $taskbarRect.Bottom - $taskbarRect.Top }; bounds = @{ x = $taskbarMonitor.Left; y = $taskbarMonitor.Top; width = $taskbarMonitor.Right - $taskbarMonitor.Left; height = $taskbarMonitor.Bottom - $taskbarMonitor.Top }; overflow = $overflow } | ConvertTo-Json -Compress
    if ($taskbarState -ne $lastTaskbarState) {
      [Console]::Out.WriteLine($taskbarState)
      [Console]::Out.Flush()
      $lastTaskbarState = $taskbarState
    }
  }
  Start-Sleep -Milliseconds 150
}

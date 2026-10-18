# BatteryDock

Windows x64 offline battery monitor. The Apple-inspired interface includes one application tray icon, a battery panel and locally bundled device images.

## Development

Use Node.js with npm on Windows x64:

```powershell
npm ci --ignore-scripts
node node_modules/electron/install.js
npm run assets
npm test
npm start
```

The `node-hid` package ships its Windows N-API prebuild. The native backend runs in a worker thread. Only the two verified battery query commands are transmitted. Raw keyboard input collections are never opened.

```powershell
npm run test:app
npm run test:ui
npm run test:strip
npm run test:panel
npm run pack
```

`test:app` uses a separate profile and a temporary `BatteryDock_Test` login item, removes the login item afterward, and writes screenshots/reports under the adjacent `verification` directory. To test a built executable, set `BATTERY_DOCK_EXECUTABLE` to its absolute path before running the smoke script.

`test:ui` checks repeated settings interactions and navigation at 100%, 125%, 150% and 200% DPI. Window sizing uses intrinsic panel height and caches the last requested content size to prevent fractional-DPI resize feedback.

`test:strip` checks the same four scales, silent startup without panel focus, local photo loading, charging at 100%, low battery, stale/unsupported readings, device visibility and panel placement. State fixtures are injected only through the test-mode hook after an actual HID poll. Fixture screenshots are explicitly named as such.

`test:panel` loads the native taskbar reader, then simulates overflow flyout close/reopen and taskbar auto-hide at the same four scales. It checks taskbar anchoring, cached overflow coordinates, Settings content, repeated-movement stability and hidden-window behavior. These simulations do not change Windows taskbar settings.

Choosing the battery widget saves the preference and opens the widget panel. Choosing the device list stays in Settings and expands every device's full information vertically below the picker, including local photos, charging status, voltage, unavailable electrical fields, last successful reading and visibility switches. No extra navigation is needed to read the list. A failed save keeps Settings open with an error.

The main panel header contains only Settings and Close. Device view selection remains inside Settings.

## Tray Visibility

The independent battery strip is disabled by default. Its optional Settings switch shows device photos, explicit labels and large percentages above the primary display's taskbar. Clicking any device opens the panel; right-clicking opens the application menu. The strip follows the desktop work area after display, DPI or taskbar changes. It is an independent window, not an embedded Windows taskbar extension.

A bundled, hidden PowerShell helper reads the primary taskbar rectangle and auto-hide flag using Windows APIs. It sends changes to the app, which converts physical coordinates to DIPs and follows the taskbar when it retracts or expands. The helper does not alter taskbar settings and exits with the app. If it is unavailable, work-area positioning remains the fallback.

The helper also watches the notification overflow flyout on Windows 10 and 11. Closing that flyout reanchors an open panel to the taskbar corner even when the taskbar itself has not moved. Cached icon bounds inside the closed flyout are not reused as desktop anchors.

One stable application tray icon provides access, whether the optional strip is enabled or disabled. Hover to read device statuses, click to open or hide the battery panel, and right-click for the application menu. Device visibility and battery updates do not create additional icons. Windows controls whether notification icons appear on the taskbar or in overflow. Use the taskbar settings button in Settings, or drag the BatteryDock icon from overflow onto the taskbar once. Keep the installation path stable so Windows can retain that selection. Portable extraction uses a stable directory for the same reason.

Device visibility switches control optional strip membership. All devices remain accessible in the panel and Settings. A stale, loading, disconnected or unsupported strip entry shows `--`; a stale percentage remains explicitly labelled as the previous value in the full panel. Only fresh readings trigger low-battery colours and charging indicators.

Official images identify the orange VGN Dragonfly 3 colour family, black transparent-keycap HI75C family, and purple 8BitDo Ultimate 2. The keyboard photograph is a family appearance reference, not a verified Pro photograph, as disclosed in device details. See `assets/devices/SOURCES.md` for source and rights attribution. No images are downloaded at runtime.

## Startup

The installer creates a current-user Run value pointing to the installed executable with `--silent`. Portable registration uses `PORTABLE_EXECUTABLE_FILE` rather than the temporary extracted executable. Settings can disable or re-enable registration. Native login-item enabled state and the exact Run command are both checked. Electron's parsed `launchItems.args` can omit switches, so it is not used to prove the silent argument exists.

Silent startup starts the tray icon, HID worker and enabled battery strip without opening or focusing the full panel. When the strip is disabled, no window is shown. Low battery notifications are suppressed during the first minute and for charging or stale devices. UI preferences survive restart. The single-instance lock prevents duplicate pollers.

## Hardware scope

- Mouse: `391d:1a05`, usage page `ff02`, report ID 8, command 4.
- User-confirmed LeoBog HI75C Pro: `3554:fa09`, usage page `ff02`, report ID 19, command `4a`.
- 8BitDo `2dc8:6013` is listed as unsupported, with no speculative query sent.

The keyboard name is a local device mapping, not a universal model identification from shared VID/PID. A failed poll preserves the previous value while marking it stale. Response framing, ranges and checksums are validated.

## Dependencies

Electron and electron-builder provide the desktop shell and installers. node-hid provides HID access. Lucide supplies icons. All runtime assets are bundled. The renderer uses a sandboxed preload, context isolation and a restrictive CSP; it has no Node or network access. See packaged dependency license files for upstream license terms.

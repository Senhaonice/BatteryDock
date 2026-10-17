# BatteryDock

Windows x64 offline battery tray monitor. Electron UI matches the reviewed Apple-inspired prototype.

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
npm run pack
```

`test:app` uses a separate profile and a temporary `BatteryDock_Test` login item, removes the login item afterward, and writes screenshots/reports under the adjacent `verification` directory. To test a built executable, set `BATTERY_DOCK_EXECUTABLE` to its absolute path before running the smoke script.

`test:ui` checks repeated settings interactions and navigation at 100%, 125%, 150% and 200% DPI. Window sizing uses intrinsic panel height and caches the last requested content size to prevent fractional-DPI resize feedback.

Choosing either panel layout saves the preference and immediately returns to the selected main view. A failed save keeps the settings view open with an error. UI checks assert the visible device list or widget grid, in addition to the stored preference.

## Tray Visibility

Each device has its own icon plus percentage and a stable GUID tied to the executable path. Windows controls whether a notification icon appears on the taskbar or in the overflow. Use the taskbar settings button in Settings, or drag each BatteryDock icon from the overflow onto the taskbar once. Keep the installation path stable so Windows can retain that selection. Portable extraction uses a stable directory for the same reason.

## Startup

The installer creates a current-user Run value pointing to the installed executable with `--silent`. Portable registration uses `PORTABLE_EXECUTABLE_FILE` rather than the temporary extracted executable. Settings can disable or re-enable registration. Native login-item enabled state and the exact Run command are both checked. Electron's parsed `launchItems.args` can omit switches, so it is not used to prove the silent argument exists.

Silent startup does not instantiate a window; it only starts tray icons and the HID worker. Low battery notifications are suppressed during the first minute and for charging or stale devices. UI preferences survive restart. The single-instance lock prevents duplicate pollers.

## Hardware scope

- Mouse: `391d:1a05`, usage page `ff02`, report ID 8, command 4.
- User-confirmed LeoBog HI75C Pro: `3554:fa09`, usage page `ff02`, report ID 19, command `4a`.
- 8BitDo `2dc8:6013` is listed as unsupported, with no speculative query sent.

The keyboard name is a local device mapping, not a universal model identification from shared VID/PID. A failed poll preserves the previous value while marking it stale. Response framing, ranges and checksums are validated.

## Dependencies

Electron and electron-builder provide the desktop shell and installers. node-hid provides HID access. Lucide supplies icons. All runtime assets are bundled. The renderer uses a sandboxed preload, context isolation and a restrictive CSP; it has no Node or network access. See packaged dependency license files for upstream license terms.

# BatteryDock Project Conventions

## Packaging And GitHub

When a BatteryDock version is packaged at the user's request or with their approval, automatically synchronize it to the public GitHub repository `Senhaonice/BatteryDock` in the same task. This standing authorization was given by the user on 2026-10-18.

- Publish the matching source commit/tag and versioned GitHub Release.
- Attach the Windows installer, portable executable, corresponding source archive, and SHA-256 checksums.
- Include concise release notes and verify remote file sizes and SHA-256 digests against local files.
- Mark the newest stable version as Latest. Preserve older releases.
- Exclude credentials, tokens, machine-local settings, logs, dependencies, and temporary test profiles.
- If authentication or network access blocks publication, report the exact blocker and retain the local package for retry. Do not claim it has been synchronized.

This rule does not itself request packaging of a design discussion or preview.

## Design

Keep the Apple-inspired visual style. Prioritize readability at actual Windows tray dimensions. The user selected a small battery strip above the taskbar, with device imagery beside large percentages, for the next design preview. Use verified official images matching each device and color where possible; do not mislabel generated artwork as product photography.

Confirmed device colors: orange VGN Dragonfly 3 Master+ mouse; black LeoBog HI75C Pro keyboard with transparent keycaps; purple 8BitDo Ultimate 2 controller. A HI75C family image is only an appearance reference until an exact Pro image is verified. The controller's battery protocol is unsupported; never display invented live battery data for it.

# build-resources

Assets electron-builder uses when packaging the app. This folder is **not** the
CRA `build/` output (that one gets wiped every `npm run build`), so files here are
safe.

## Drop your app icon here

Add **one** of these and electron-builder will generate the rest automatically:

- **`icon.png`** — a single square PNG, **512×512 or larger** (1024×1024 is ideal).
  electron-builder derives the Windows `.ico` and Linux icons from it.

That's it. Once `icon.png` is here, `npm run dist` will brand the installer, the
app window, and the taskbar/desktop entry. No config change needed.

### Optional, for the sharpest result
- `icon.ico` — a multi-size Windows icon (16–256 px). If present it's used as-is
  for Windows instead of being generated from the PNG.

Until you add an icon, builds still succeed — they just use Electron's default
icon (with a harmless warning).

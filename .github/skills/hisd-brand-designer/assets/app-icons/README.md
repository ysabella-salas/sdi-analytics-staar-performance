# HISD app icons

Generated favicon + app-icon set built from the HISD teal skyline mark by `scripts/generate_app_icons.py`. Do not hand-edit; rerun the script to regenerate.

## Source

- Mark: `assets/logos/icon/teal.svg` (single-color teal skyline icon)

- Brand teal: `#00A3AF`

- Rasterizer: cross-platform (`scripts/_raster.py`) — rsvg-convert / cairosvg / inkscape / magick / a headless browser (Edge on Windows, Chrome/Chromium on macOS+Linux) / qlmanage. Works on Windows, macOS, and Linux.

## Files

| File | Size | Field | Use |
| --- | --- | --- | --- |
| `favicon.svg` | vector | transparent | Modern browser tab; crisp at any DPI |
| `favicon-16.png` | 16x16 | transparent | Legacy favicon |
| `favicon-32.png` | 32x32 | transparent | Legacy favicon |
| `favicon-48.png` | 48x48 | transparent | Legacy / Windows tiles |
| `apple-touch-icon.png` | 180x180 | transparent | iOS home screen |
| `icon-192.png` | 192x192 | transparent | PWA manifest |
| `icon-512.png` | 512x512 | transparent | PWA manifest / splash |
| `icon-512-maskable.png` | 512x512 | solid #00A3AF | Android adaptive `purpose: maskable` |
| `site.webmanifest` | - | - | PWA manifest snippet |
| `head-snippet.html` | - | - | `<link>` tags for `<head>` |

## Drop-in

Copy the PNGs, `favicon.svg`, and `site.webmanifest` to your site root, then paste `head-snippet.html` into `<head>`. Adjust the `href` prefixes if you serve from a subdirectory.

## Maskable safe zone

The maskable icon centers the mark on a solid #00A3AF field with ~18% padding per side so Android's adaptive mask can crop the corners without clipping the skyline.

## Verified dimensions

- `favicon-16.png` -> 16x16
- `favicon-32.png` -> 32x32
- `favicon-48.png` -> 48x48
- `apple-touch-icon.png` -> 180x180
- `icon-192.png` -> 192x192
- `icon-512.png` -> 512x512
- `icon-512-maskable.png` -> 512x512

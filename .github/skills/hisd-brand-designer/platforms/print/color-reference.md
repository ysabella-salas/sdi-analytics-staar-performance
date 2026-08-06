# HISD Print Color Reference (CMYK / Pantone)

**This file is the print source of truth.** For anything that goes to a professional
printer, specify **Pantone (PMS) first, CMYK second**. Do **not** send RGB/hex values to
a commercial press — screen tokens (`hisd.tokens.json`) are for digital output only.

All values below are transcribed directly from the official
**HISD Branding Quick Reference Guide (2025)** —
`Artifacts/Brand-Assets/guidelines/HISD-Branding-Quick-Reference-(2025).pdf`
(Primary Color Codes and Secondary Color Codes pages). The HEX/RGB column is the
on-screen equivalent and matches `assets/hisd.tokens.json`.

## Primary colors

| Name       | HEX (screen/RGB) | RGB           | CMYK (C M Y K) | Pantone   |
| ---------- | ---------------- | ------------- | -------------- | --------- |
| Teal       | `#00A3AF`        | 0 163 175     | 78 15 31 0     | PMS 7467 C |
| Dark Grey  | `#24383C`        | 36 56 60      | 82 61 58 53    | PMS 7546 C |
| Dark Green | `#006F5B`        | 0 111 91      | 89 34 69 20    | PMS 568 C  |
| Light Green| `#6DB83D`        | 109 184 61    | 62 3 100 0     | PMS 361 C  |

## Secondary colors

| Name       | HEX (screen/RGB) | RGB           | CMYK (C M Y K) | Pantone   |
| ---------- | ---------------- | ------------- | -------------- | --------- |
| Yellow     | `#F9D04E`        | 249 208 78    | 2 16 81 0      | PMS 128 C  |
| Purple     | `#474F99`        | 71 79 153     | 85 79 6 1      | PMS 7670 C |
| Blue       | `#4975BD`        | 73 117 189    | 75 53 0 0      | PMS 4150 C |
| Red        | `#D96364`        | 217 99 100    | 11 75 55 1     | PMS 2031 C |
| Light Grey | `#D4D4D5`        | 212 212 213   | 0 0 0 16       | PMS 427 C  |
| Off-White  | `#FFFFED`        | 255 255 237   | 0 0 7 0        | derive from the Pantone bridge |

### Note on Off-White

The Quick Reference Guide lists Off-White with **CMYK 0 0 7 0** and **HEX `#FFFFED`** but
**does not assign it a PMS number** (the Print Codes block shows only CMYK). For a spot
match, **derive from the Pantone bridge** (run the CMYK 0 0 7 0 build through a Pantone
Color Bridge guide / Adobe's CMYK→PMS lookup) rather than guessing. In most documents
Off-White is used as a paper/background tint and is reproduced in process (CMYK), so a
spot color is rarely needed.

## Usage rules for print

- **Spot vs. process.** Use **Pantone spot inks** for logos, the ribbon, and any
  large flat brand fill where color fidelity matters (letterhead, covers, signage).
  Use **CMYK (process)** when the job is full-color and a spot plate isn't economical.
- **Never** hand a printer the hex/RGB value and expect a match — RGB is wider-gamut
  than CMYK and will shift on press.
- **Tints.** The PDF publishes 10–90% tint ramps for each color with their own hex/RGB.
  For print, specify tints as a **percentage of the parent Pantone or CMYK build**
  (e.g. "PMS 7467 C at 40%"), not as a separate hex.
- **Rich black.** For solid dark-grey/black text areas in print, Dark Grey
  (PMS 7546 C / CMYK 82 61 58 53) is the brand "black." For true page black use a
  press-standard rich black (e.g. C60 M40 Y40 K100) per your printer's spec — do not
  invent one here.
- **Paper.** Pantone "C" = coated stock. If printing on uncoated stock, ask the printer
  for the matching **"U"** Pantone (e.g. PMS 7467 U); the appearance shifts on uncoated.

## Provenance

Every CMYK and Pantone value above is taken verbatim from the 2025 Quick Reference
Guide. The only value not fully specified by the source is the Off-White Pantone, which
is explicitly marked "derive from the Pantone bridge." No CMYK or Pantone numbers were
invented.

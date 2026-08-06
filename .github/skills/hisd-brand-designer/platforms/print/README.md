# HISD Print + Office Kit

Print-ready, brand-correct templates for HISD letterhead, report covers, and memos,
plus the **CMYK / Pantone source of truth** for professional printing.

Print is **not** RGB. Screens use the hex tokens in `assets/hisd.tokens.json`; a press
uses **Pantone (spot)** and **CMYK (process)**. This kit keeps those two worlds separate.

```
platforms/print/
├── color-reference.md     # PRINT SOURCE OF TRUTH: name -> hex -> CMYK -> Pantone
├── print.css              # @page + @media print stylesheet (ribbon, headers, footers)
├── README.md              # you are here
├── assets/logos/          # self-contained logo SVGs the templates reference
│   ├── full-dark-grey.svg
│   ├── full-white.svg
│   └── seal-flat-full-color.svg
└── templates/
    ├── letterhead.html
    ├── report-cover.html
    └── memo.html
```

## How to use — print to PDF

1. Open any file in `templates/` in **Chrome or Edge** (Chromium gives the most
   predictable print result).
2. Press **Cmd-P** (macOS) / **Ctrl-P** (Windows).
3. In the print dialog:
   - **Destination:** Save as PDF
   - **Paper size:** Letter
   - **Margins:** Default
   - **Background graphics: ON** — this is required, or the teal ribbon, table headers,
     and callout fills will be dropped. (`print-color-adjust: exact` in `print.css`
     asks for this, but the browser checkbox is the final gate.)
4. Save. The running header/footer and page numbers render in the page margins.

> The on-screen preview shows a drop-shadowed "page" frame and a grey note at the
> bottom. Both are screen-only and disappear in the printed/PDF output.

## The CMYK / Pantone rule for professional printing

For anything going to a commercial printer (offset, large-format, signage, swag):

- **Specify Pantone first, CMYK second. Never RGB/hex.** RGB is wider-gamut than CMYK
  and will shift unpredictably on press.
- Pull exact builds from **`color-reference.md`**. Examples:
  - Teal → **PMS 7467 C** / CMYK 78 15 31 0
  - Dark Grey (brand "black") → **PMS 7546 C** / CMYK 82 61 58 53
  - Light Green → **PMS 361 C** / CMYK 62 3 100 0
- **Coated vs. uncoated:** the guide values are "**C**" (coated). On uncoated stock,
  request the matching "**U**" Pantone from your printer — color appears different on
  uncoated paper.
- **Tints** are a percentage of the parent Pantone/CMYK (e.g. "PMS 7467 C at 40%"),
  not a separate hex.
- **Off-White** has no Pantone in the source guide — it is marked "derive from the
  Pantone bridge" in `color-reference.md`. Do not guess a PMS number for it.

The HTML/CSS in this kit uses sRGB hex (the screen equivalents) because that is all a
PDF-from-browser workflow can carry. Treat a Cmd-P PDF as a **proof / office document**.
For a true press run, send the printer the native vector logos plus the Pantone/CMYK
spec from `color-reference.md`, and have them build the spot color plates.

## Bleed and safe area

Browser "Save as PDF" produces a **borderless Letter page with no bleed** — fine for
office printing and email. For a professional bleed print (where ink runs to the trimmed
edge, as the report cover's teal band is designed to do):

- **Trim size:** 8.5 × 11 in (US Letter)
- **Bleed:** extend full-bleed art **0.125 in (1/8")** past trim on all sides →
  build at **8.75 × 11.25 in**.
- **Safe area:** keep all text and the logo **at least 0.25 in** inside the trim so
  nothing important is lost to trimming variance.
- A browser PDF cannot add bleed marks. To produce a true bleed file, rebuild the cover
  in **InDesign / Illustrator** (or run the HTML through a paged engine like Prince or
  WeasyPrint configured with `@page { size: 8.75in 11.25in; marks: crop bleed; }`) and
  hand off a press-ready PDF/X.

## Real Office templates (.dotx / .potx)

True Office templates are binary OOXML and **must be authored in Word/PowerPoint** — they
cannot be generated from HTML/CSS. Use the designs here as the visual + color spec, then
build them once:

**Word letterhead/memo → `.dotx`**
1. New blank document. Page Layout → Margins → Custom → 0.75 in (top 0.9 in).
2. Insert → Header. Place the logo (`assets/logos/full-dark-grey.svg`, or its PNG) and
   draw a **rectangle shape** for the ribbon. Set its fill via **More Fill Colors →
   Custom** using the **RGB** from `color-reference.md` (Teal 0 163 175). Word's screen
   fill is RGB; the **print shop converts to PMS 7467 C** per the color reference.
3. Insert → Footer → Page Number; add the district name on the left.
4. Set fonts to the Microsoft-app fonts the guide names: **Arial** (display/body) and
   **Times New Roman** where a serif is needed (brand fonts: Parkinsans / Radio Canada /
   Lora if licensed and installed).
5. Apply widow/orphan control: Home → Paragraph → Line and Page Breaks →
   ✓ Widow/Orphan control, ✓ Keep with next on headings.
6. **File → Save As → Word Template (*.dotx)** → save to the Custom Office Templates
   folder so it appears under File → New.

**PowerPoint cover/deck → `.potx`**
1. View → Slide Master. On the master, add the logo and a ribbon rectangle filled with
   the brand RGB (as above).
2. Define theme colors (Design → Variants → Colors → Customize) using the palette's RGB
   values so brand colors appear in the theme picker.
3. **File → Save As → PowerPoint Template (*.potx)**.

Store the finished `.dotx` / `.potx` alongside this kit (e.g. a future
`platforms/print/office/` folder) or in the district's Custom Office Templates location.
When ordering professionally printed letterhead, give the vendor the `.dotx` for layout
**and** `color-reference.md` for the ink spec.

## Source

All CMYK/Pantone values are transcribed verbatim from
`Artifacts/Brand-Assets/guidelines/HISD-Branding-Quick-Reference-(2025).pdf`.
Hex equivalents match `assets/hisd.tokens.json`. No print values were invented; the one
unspecified value (Off-White Pantone) is flagged in `color-reference.md`.

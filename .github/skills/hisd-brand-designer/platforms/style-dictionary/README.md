# HISD Style Dictionary

Multi-platform build of the **HISD design tokens** using
[Style Dictionary v4](https://styledictionary.com/). It consumes the W3C
**DTCG** token file (`$value` / `$type`) and emits ready-to-use outputs for
web, iOS, Android, and Figma.

```
platforms/style-dictionary/
├── package.json                 style-dictionary ^4 + `build` script
├── config.mjs                   the build config (DTCG-aware, custom Figma format)
├── tokens/
│   └── hisd.tokens.json         SOURCE — a copy of ../../assets/hisd.tokens.json
└── build/                       GENERATED outputs (run `npm run build`)
    ├── css/hisd.variables.css
    ├── scss/_hisd.variables.scss
    ├── js/hisd.tokens.js + .d.ts
    ├── ios/HISDColors.swift + hisd-tokens.json
    ├── android/hisd_colors.xml + hisd_dimens.xml
    └── figma/hisd.tokens-studio.json
```

## Install & build

Requires Node 18+ (developed on Node 26) and npm.

```bash
cd .skills/design/hisd-brand-designer/platforms/style-dictionary
npm install
npm run build        # → style-dictionary build --config config.mjs
```

Outputs are written to `build/`. To wipe them: `npm run clean`.

## Source of truth

The canonical token file lives at
`/.skills/design/hisd-brand-designer/assets/hisd.tokens.json` and is generated from the HISD
2025 brand by `build_tokens.py` — **do not edit tokens by hand**.

`tokens/hisd.tokens.json` is a verbatim copy that Style Dictionary reads.
When the asset is regenerated, re-sync it:

```bash
cp ../../assets/hisd.tokens.json tokens/hisd.tokens.json
npm run build
```

(If you'd rather not duplicate the file, point `source` in `config.mjs` at
`../../assets/hisd.tokens.json` instead — the copy is kept so this kit builds
standalone regardless of the assets layout.)

These are **DTCG** tokens (`$value` / `$type`). Style Dictionary v4 reads that
format natively when `usesDtcg: true` is set, which the config does on every
platform.

## What each output is for

| Output | Format | Use it for |
| --- | --- | --- |
| `css/hisd.variables.css` | `css/variables` | Web. Custom properties on `:root` — `var(--color-teal-500)`, `var(--space-4)`, etc. Import directly or `@import` into your global stylesheet. |
| `scss/_hisd.variables.scss` | `scss/variables` | Sass projects. `$color-teal-500`, `$space-4`, … for use in mixins/maths before compile. |
| `js/hisd.tokens.js` | `javascript/es6` | JS/TS apps. `import { ColorTeal500 } from '.../hisd.tokens.js'`. Good for CSS-in-JS, charts, canvas, React Native style objects. |
| `js/hisd.tokens.d.ts` | `typescript/es6-declarations` | Type declarations so the `.js` export is fully typed in TS. |
| `ios/HISDColors.swift` | `ios-swift/class.swift` | iOS (UIKit). `public class HISDColors` exposing `UIColor` constants — `HISDColors.brandTeal`. Colors only. |
| `ios/hisd-tokens.json` | `json` (nested) | iOS/tooling consumers that want raw token values (hex, rem, ms) rather than Swift. Full nested tree, all token types. |
| `android/hisd_colors.xml` | `android/colors` | Android. `<color name="color_teal_500">#ff00a3af</color>` resources for `res/values/`. |
| `android/hisd_dimens.xml` | `android/dimens` | Android. `<dimen>` resources for spacing, radius, font sizes, etc. |
| `figma/hisd.tokens-studio.json` | `figma/tokens-studio` (custom) | Figma, via the **Tokens Studio** plugin. See below. |

### A note on coverage

CSS / SCSS / JS / iOS JSON / Figma each carry **all 229 tokens**. The Swift and
Android outputs are deliberately narrower:

- **Swift** emits the **157 color** tokens (the `isColor` filter), since that's
  what `ios-swift/class.swift` models as `UIColor`. Non-color tokens are
  available raw in `ios/hisd-tokens.json`.
- **Android** emits **157 colors** + **39 dimensions** = 196 resources. The
  remaining token types (font family/weight, line-height numbers, motion
  durations, easings, shadows) have no native `color`/`dimen` resource and are
  intentionally omitted from the XML.

## Importing the Figma export into Tokens Studio

`build/figma/hisd.tokens-studio.json` is shaped for the
[**Tokens Studio for Figma**](https://tokens.studio/) plugin (single-file
format): one token set named `global`, with `value` / `type` keys and the
plugin's type vocabulary (`color`, `dimension`, `fontFamilies`, `fontWeights`,
`boxShadow`, `cubicBezier`, …). It also carries empty `$themes` and a
`$metadata.tokenSetOrder` so the plugin accepts it as a complete file.

To import:

1. In Figma, open **Tokens Studio** (Plugins → Tokens Studio for Figma).
2. Open the plugin menu (☰ top-left) → **Settings**, and confirm storage is set
   to **Local** (or your Git provider, if you sync there).
3. Back on the plugin's main view, open the menu again → **Load** /
   **Import** → **Import → JSON file** (or use the **Tools → Import**
   panel, depending on plugin version).
4. Paste the contents of `hisd.tokens-studio.json`, or choose the file.
5. Choose to **overwrite** the existing set when prompted. The tokens land
   under a set named **`global`**, grouped exactly like the source
   (`color/`, `brand/`, `theme/`, `dataviz/`, `font/`, `space/`, `radius/`,
   `elevation/`, `motion/`).
6. (Optional) In the plugin, click **Apply to document** to generate Figma
   variables / styles from the set.

> Re-importing after a token change: re-run `npm run build`, then repeat the
> import and overwrite the `global` set. Because tokens are grouped by path,
> existing Figma variable bindings stay attached to the same token names.

## Extending the config

- **Add a platform**: add a key under `platforms` in `config.mjs` with a
  `transformGroup`, `buildPath`, `options.usesDtcg: true`, and `files`.
- **Aliases / references**: the current source uses literal values everywhere
  (no `{color.teal.500}` references), so `outputReferences: true` is set on CSS
  and SCSS but is currently a no-op. If `build_tokens.py` starts emitting DTCG
  aliases, those outputs will automatically reference instead of inline.
- **The Figma format** is a custom format registered at the top of
  `config.mjs` (`figma/tokens-studio`). It walks the nested token tree, rewrites
  `$value`/`$type` → `value`/`type`, and maps DTCG types to Tokens Studio types.

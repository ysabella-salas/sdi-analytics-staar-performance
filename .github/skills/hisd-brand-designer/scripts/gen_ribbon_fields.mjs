#!/usr/bin/env node
// gen_ribbon_fields.mjs — regenerate the committed Ribbon field SVG assets.
//
// The Ribbon device = a solid brand-color FIELD overlaid with soft, white,
// round-capped, low-opacity "bayou current" strokes that sweep edge-to-edge.
// The geometry is owned entirely by the LOCKED line kit
// (../framework/ribbon-gl/ribbon-lines.js) — this script is just the build
// step that rasterizes its curated PRESETS to standalone, themeable SVG files
// under assets/ribbon/.
//
// Outputs (overwritten on every run):
//   ribbon-field.svg            — the canonical DEFAULT (preset 'currents').
//                                 Keep this filename: docs/components reference it.
//   ribbon-field-<name>.svg     — one file per named preset (delta, bayou, ...).
//
// Each file gets an XML declaration, a <title>, role="img" + aria-hidden="true",
// and hardcoded-hex fallbacks (carried by the kit's CSS-var defaults) so it
// renders standalone in print / email / no-CSS contexts.
//
// Run: node scripts/gen_ribbon_fields.mjs   (from the skill root)
//
// This script OWNS the generated assets/ribbon/ribbon-field*.svg files. Do not
// hand-edit those SVGs — edit this script (or the line kit) and re-run.

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { preset, PRESETS, linesToSVG, fieldSVG } from '../framework/ribbon-gl/ribbon-lines.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'assets', 'ribbon');

// The canonical default. Docs + components hardcode this filename.
const DEFAULT_PRESET = 'currents';

const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>';
const TITLE = '<title>HISD Ribbon</title>';

// Wrap the kit's standalone SVG with an XML declaration and an injected <title>.
// linesToSVG already emits role="img", aria-hidden="true", and the hardcoded-hex
// fallbacks (via the --ribbon-* CSS-var defaults). We only add the prolog and the
// accessible title, slotting <title> as the first child of <svg> (per SVG spec).
function decorate(svg) {
  const open = svg.indexOf('>') + 1; // end of the opening <svg ...> tag
  const head = svg.slice(0, open);
  const body = svg.slice(open);
  return `${XML_DECL}\n${head}\n  ${TITLE}${body}\n`;
}

function build(name) {
  const file = name === DEFAULT_PRESET ? 'ribbon-field.svg' : `ribbon-field-${name}.svg`;
  const lines = preset(name);
  const svg = decorate(linesToSVG(lines));
  const path = join(OUT_DIR, file);
  writeFileSync(path, svg, 'utf8');
  return { file, name, seed: PRESETS[name], paths: lines.length, bytes: svg.length };
}

// Canonical default first (ribbon-field.svg), then every named preset.
const order = [DEFAULT_PRESET, ...Object.keys(PRESETS).filter((n) => n !== DEFAULT_PRESET)];
const written = order.map(build);

const pad = (s, n) => String(s).padEnd(n);
console.log(`Wrote ${written.length} Ribbon field SVG(s) to assets/ribbon/:`);
for (const w of written) {
  console.log(
    `  ${pad(w.file, 26)} preset=${pad(w.name, 9)} seed=${pad(w.seed, 3)} ` +
    `paths=${w.paths}  ${w.bytes} bytes`,
  );
}

// ── Per-platform surface backgrounds ────────────────────────────────────────
// The 16:9 preset loop above stays canonical/untouched. Below we render the same
// Ribbon device (teal field + white edge-to-edge strokes from the line kit) at
// real platform sizes. Every surface is DETERMINISTIC (fixed preset/opts), the
// field is the brand teal #00A3AF in BOTH themes, and only the stroke opacity
// flips (light 0.16 / dark 0.22). The opacity is baked as a var() WITH a hex
// fallback so print/static (no-CSS) contexts still get the exact value.

// light/dark stroke opacities — same field both themes.
const STROKE_OP = { light: 'var(--ribbon-stroke-opacity, 0.16)', dark: 'var(--ribbon-stroke-opacity, 0.22)' };

// Each surface: name, size, the preset (or generate opts), and which themes.
// `generate` (optional) passes extra opts straight to the kit's generate().
const SURFACES = [
  { dir: 'social',  file: 'og',             w: 1200, h: 630,  preset: 'delta',    themes: ['light', 'dark'] },
  { dir: 'social',  file: 'square',         w: 1080, h: 1080, preset: 'calm',     themes: ['light', 'dark'] },
  { dir: 'social',  file: 'story',          w: 1080, h: 1920, preset: 'bayou',    themes: ['light', 'dark'] },
  { dir: 'powerbi', file: 'title-page',     w: 1280, h: 720,  preset: 'currents', themes: ['light', 'dark'] },
  { dir: 'powerbi', file: 'content-header', w: 1280, h: 72,   preset: 'currents',
    generate: { count: 2, loopChance: 0, oppositeBias: 1 }, themes: ['light', 'dark'] },
  { dir: 'print',   file: 'cover',          w: 1632, h: 2112, preset: 'currents', themes: ['light'] },
];

function buildSurface(s, theme) {
  const dirPath = join(OUT_DIR, s.dir);
  mkdirSync(dirPath, { recursive: true });
  const svg = decorate(fieldSVG({
    preset: s.preset,
    w: s.w, h: s.h,
    generate: s.generate || {},
    strokeOpacity: STROKE_OP[theme],
  }));
  const file = `${s.file}-${theme}.svg`;
  const path = join(dirPath, file);
  writeFileSync(path, svg, 'utf8');
  return {
    name: `${s.dir}/${file}`,
    size: `${s.w}x${s.h}`,
    preset: s.preset,
    theme,
    path,
    bytes: svg.length,
  };
}

const surfaces = [];
for (const s of SURFACES) {
  for (const theme of s.themes) surfaces.push(buildSurface(s, theme));
}

console.log(`\nWrote ${surfaces.length} platform surface SVG(s) under assets/ribbon/{social,powerbi,print}/:`);
for (const s of surfaces) {
  console.log(
    `  ${pad(s.name, 30)} ${pad(s.size, 11)} preset=${pad(s.preset, 9)} ` +
    `theme=${pad(s.theme, 5)} ${s.bytes} bytes  ${s.path}`,
  );
}

/**
 * Types for the HISD Ribbon "line kit" (ribbon-lines.js) — the deterministic
 * generator + preset selection for the white edge-to-edge "bayou current" strokes.
 * Keep in sync with ribbon-lines.js.
 */

/** One generated ribbon line: a path 'd', its stroke width, and per-path alpha. */
export interface RibbonLine {
  d: string;
  width: number;
  opacity: number;
}

/** [edge, t] — edge: 0 top, 1 right, 2 bottom, 3 left; t in 0..1 along that edge. */
export type EdgePoint = [number, number];

export interface RibbonLineOptions {
  from: EdgePoint;
  to: EdgePoint;
  bow?: number;
  bow2?: number | null;
  width?: number;
  opacity?: number;
  overshoot?: number;
  w?: number;
  h?: number;
}

export interface GenerateOptions {
  count?: number | [number, number];
  widthRange?: [number, number];
  opacityRange?: [number, number];
  loopChance?: number;
  minGap?: number;
  oppositeBias?: number;
  /** Surface width (default VIEW.w). Scales the centrality box + channel. */
  w?: number;
  /** Surface height (default VIEW.h). Scales the centrality box + channel. */
  h?: number;
}

export interface LinesToSVGOptions {
  w?: number;
  h?: number;
  layered?: boolean;
  field?: string;
  stroke?: string;
  groupOpacity?: string;
}

export const VIEW: { w: number; h: number };

/** Build ONE ribbon line sweeping between two edges of the field. */
export function ribbonLine(opts: RibbonLineOptions): RibbonLine;

/** Deterministically generate a whole field composition from an integer seed. */
export function generate(seed?: number, opts?: GenerateOptions): RibbonLine[];

/** Curated named presets → stable seeds. */
export const PRESETS: Record<string, number>;

/** Generate the composition for a named preset. */
export function preset(name: string, opts?: GenerateOptions): RibbonLine[];

/** Emit a full standalone, themeable SVG string (two drift sub-layers by default). */
export function linesToSVG(lines: RibbonLine[], o?: LinesToSVGOptions): string;

export interface FieldSVGOptions {
  /** Named PRESET; falls back to `seed`, then to 'currents'. */
  preset?: string;
  /** Integer seed; used when `preset` is absent/unknown. */
  seed?: number;
  /** Surface width (default VIEW.w). */
  w?: number;
  /** Surface height (default VIEW.h). */
  h?: number;
  /** Extra generate() options (count, loopChance, oppositeBias, …). */
  generate?: GenerateOptions;
  /** Split into two drift sub-layers (default true). */
  layered?: boolean;
  field?: string;
  stroke?: string;
  /** Group stroke opacity; baked into the SVG (e.g. var() w/ hex fallback). */
  strokeOpacity?: string;
}

/**
 * Resolve a preset|seed, generate at a given w/h, and emit a themeable
 * standalone SVG string. With no w/h + a preset, byte-identical to the
 * committed preset assets.
 */
export function fieldSVG(opts?: FieldSVGOptions): string;

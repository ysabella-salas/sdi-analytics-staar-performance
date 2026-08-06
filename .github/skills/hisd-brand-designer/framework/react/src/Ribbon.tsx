import * as React from 'react';
import { RibbonCanvas } from './RibbonCanvas';
import { preset, generate, PRESETS, type RibbonLine } from '../../ribbon-gl/ribbon-lines.js';

/**
 * HISD Ribbon — typed React wrapper around the canonical animated Ribbon device.
 *
 * THE DEVICE (ground truth): the Ribbon is NOT a gradient band. It is a SOLID
 * brand-color FIELD overlaid with a few soft, white, round-capped, low-opacity
 * sweeping/looping strokes that drift across it like Houston's bayou currents
 * (tone-on-tone: white at low opacity over a colored field reads as lighter
 * arcs). It is used FULL-BLEED as a background behind content. Animation = the
 * white strokes slowly drift/flow (a calm "current"), never a band sliding.
 *
 * This is a THIN adapter. It ALWAYS renders the static field+strokes SVG floor
 * (the canonical `ribbon-field.svg` structure, inline: a solid field <rect> plus
 * the two stroke <g> layers, themed via the `--ribbon-*` custom properties + a
 * `data-theme` ancestor). On a capable client — when `animate` is on and the tier
 * is not pinned to the static/CSS rung — it additionally mounts a client-only
 * WebGL overlay ({@link RibbonCanvas}) that composites a flow-warped white-stroke
 * texture over the solid field. The overlay never replaces the SVG; the SVG is
 * the permanent fallback.
 *
 * SSR-safe and free of `'use client'`: the static floor renders identically on
 * the server and client. Only {@link RibbonCanvas} (a child) carries
 * `'use client'` and touches the DOM/WebGL.
 *
 * Theming is automatic — the field and stroke colors come from the
 * `var(--ribbon-*)` fallbacks resolved against the nearest `data-theme` ancestor.
 * The optional `field` prop overrides the field color per section with any CSS
 * color (it is forwarded BOTH to the host background and to the WebGL core).
 */

/** Visual form of the Ribbon. `'field'` is the canonical full-bleed device. */
export type RibbonVariant = 'field' | 'fan';

/**
 * Named line-composition presets from the shared kit (`ribbon-lines.js`). Each
 * maps to a stable seed chosen to read well. Pass one to {@link RibbonProps.lines}
 * (or any integer {@link RibbonProps.seed}) to pick which "bayou current"
 * composition the static SVG floor renders AND the WebGL tier animates — they
 * are generated from the same kit so the two tiers always match.
 */
export type RibbonLinesPreset = keyof typeof PRESETS;

/** Render tier. `'static'` is an explicit "never animate, SVG only" pin. */
export type RibbonTier = 'auto' | 'css' | 'webgl' | 'static';

export interface RibbonProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Visual form. Defaults to `'field'` (the canonical full-bleed device). */
  variant?: RibbonVariant;
  /**
   * Line composition — a named PRESET from the shared kit (`currents`, `delta`,
   * `bayou`, `crossing`, `calm`, `weave`, `bend`, `loops`, `drift`, `channels`).
   * Selects which "bayou current" stroke composition is drawn. The static SVG
   * floor is generated from the same kit the WebGL tier animates, so both tiers
   * render the SAME composition. Defaults to `'currents'`. If both `lines` and
   * `seed` are given, `lines` wins.
   */
  lines?: RibbonLinesPreset;
  /**
   * Line composition by raw integer SEED (deterministic: same seed → same
   * composition). An alternative to a named {@link RibbonProps.lines} preset for
   * ad-hoc compositions. Ignored when `lines` is set.
   */
  seed?: number;
  /**
   * Field color — any CSS color. Overrides the solid brand-color field for this
   * section (default: the resolved `--ribbon-field-bg`, teal-500 `#00A3AF`). It
   * is applied to the host background AND forwarded to the WebGL core so the
   * animated overlay composites its strokes over the same field.
   */
  field?: string;
  /**
   * Enable animation. Adds `hisd-ribbon--animate` (which drives the zero-JS CSS
   * drift tier) and, on a capable client, mounts the WebGL overlay that
   * flow-warps the white "current" strokes over the field. Defaults to `false`.
   */
  animate?: boolean;
  /** WebGL flow intensity, 0..1. Lower = subtle drift, higher = organic flow. */
  intensity?: number;
  /** Tier control passed through to the WebGL core. Defaults to `'auto'`. */
  tier?: RibbonTier;
}

/**
 * HISD Ribbon.
 *
 * @example
 * // Static field (SVG floor only) — default teal field
 * <Ribbon />
 * @example
 * // Animated field — CSS drift everywhere, WebGL flow where supported
 * <Ribbon animate intensity={0.8} />
 * @example
 * // Per-section field color override
 * <Ribbon field="#7A2D8F" animate />
 * @example
 * // Fan divider (constrained-media accent)
 * <Ribbon variant="fan" animate />
 */
export const Ribbon = React.forwardRef<HTMLSpanElement, RibbonProps>(
  function Ribbon(props, ref) {
    const {
      variant = 'field',
      lines,
      seed,
      field,
      animate = false,
      intensity,
      tier = 'auto',
      className,
      style,
      ...rest
    } = props;

    // Resolve the line composition from the shared kit so the static SVG floor
    // renders the SAME paths the WebGL tier will animate. A named preset wins;
    // else a raw seed; else the canonical `currents` preset. This is pure,
    // deterministic, and SSR-safe (no DOM, no randomness across server/client).
    const resolvedLines: RibbonLine[] = React.useMemo(
      () =>
        lines != null
          ? preset(lines)
          : seed != null
            ? generate(seed)
            : preset('currents'),
      [lines, seed],
    );

    const classes = [
      'hisd-ribbon',
      variant === 'fan' ? 'hisd-ribbon--fan' : null,
      animate ? 'hisd-ribbon--animate' : null,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    // The `field` prop overrides the host background, which the canonical SVG's
    // <rect> reads via `var(--ribbon-field-bg)`. Setting the custom property on
    // the host (rather than `background`) keeps the rect fill, the CSS floor, and
    // the WebGL field perfectly in sync. SSR-safe: it is just an inline style.
    const hostStyle: React.CSSProperties | undefined =
      field != null
        ? ({ ...style, ['--ribbon-field-bg' as string]: field } as React.CSSProperties)
        : style;

    // The WebGL overlay applies to the field device on a client that isn't pinned
    // to a non-WebGL rung. The CSS drift tier works with zero JS regardless.
    const mountCanvas =
      animate && variant === 'field' && tier !== 'css' && tier !== 'static';
    // The core only accepts 'auto' | 'css' | 'webgl'; 'static' is handled by
    // simply not mounting the overlay above, so we never forward it.
    const canvasTier = tier === 'webgl' ? 'webgl' : 'auto';

    return (
      <span
        {...rest}
        ref={ref}
        className={classes}
        style={hostStyle}
        role="presentation"
      >
        {variant === 'field' ? (
          // Canonical field+strokes device (ribbon-field.svg, inline). The strokes
          // use a single `var(--ribbon-stroke)` / currentColor, so no per-instance
          // gradient or clip ids are needed — multiple Ribbons never collide.
          <svg
            viewBox="0 0 1920 1080"
            role="img"
            aria-hidden="true"
            preserveAspectRatio="xMidYMid slice"
          >
            {/* Solid brand-color field: the DEFAULT background. `--ribbon-field-bg`
                may be overridden per section via the `field` prop; teal-500 is the
                canonical default. */}
            <rect
              x="0"
              y="0"
              width="1920"
              height="1080"
              fill="var(--ribbon-field-bg, #00A3AF)"
            />
            {/* Soft white "bayou current" strokes, generated from the shared kit
                (`ribbon-lines.js`) so this static floor matches the WebGL tier.
                Group opacity reflects the --ribbon-stroke-opacity var (default
                0.16; raise toward 0.22 on darker fields). Per-path stroke-width +
                opacity give the layered tone-on-tone depth; even/odd paths split
                into two sub-layers that drift for parallax. */}
            <g
              fill="none"
              stroke="var(--ribbon-stroke, #ffffff)"
              strokeLinecap="round"
              opacity="var(--ribbon-stroke-opacity, 0.16)"
            >
              <g className="hisd-ribbon__layer hisd-ribbon__layer--a">
                {resolvedLines
                  .filter((_, i) => i % 2 === 0)
                  .map((l, i) => (
                    <path
                      key={`a${i}`}
                      d={l.d}
                      strokeWidth={Math.round(l.width)}
                      opacity={l.opacity.toFixed(2)}
                    />
                  ))}
              </g>
              <g className="hisd-ribbon__layer hisd-ribbon__layer--b">
                {resolvedLines
                  .filter((_, i) => i % 2 === 1)
                  .map((l, i) => (
                    <path
                      key={`b${i}`}
                      d={l.d}
                      strokeWidth={Math.round(l.width)}
                      opacity={l.opacity.toFixed(2)}
                    />
                  ))}
              </g>
            </g>
          </svg>
        ) : null}
        {mountCanvas ? (
          <RibbonCanvas
            tier={canvasTier}
            intensity={intensity}
            field={field}
            lines={lines}
            seed={seed}
          />
        ) : null}
      </span>
    );
  },
);

Ribbon.displayName = 'Ribbon';

export default Ribbon;

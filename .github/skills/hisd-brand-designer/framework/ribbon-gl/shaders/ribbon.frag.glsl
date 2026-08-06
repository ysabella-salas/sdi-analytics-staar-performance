#version 300 es
// ribbon.frag.glsl — animated fill for the canonical HISD Ribbon device.
//
// This file is the AUTHORED source. index.js splices the noise helpers from
// noise.glsl in at the `// @@NOISE@@` marker below, then exports the result as the
// ready-to-compile FRAG string. The marker keeps this file readable on its own while
// guaranteeing the compiled shader has snoise()/curlNoise()/fbm() defined before use.
//
// THE DEVICE (per the corrected ground truth):
//   The Ribbon is NOT a gradient band. It is a SOLID brand-color FIELD overlaid with
//   a few soft, white, round-capped, low-opacity sweeping/looping strokes that drift
//   across it like Houston's bayou currents (tone-on-tone: white at low opacity over
//   a colored field reads as lighter arcs). It is a full-bleed background.
//
// LOOK (all motion driven by uIntensity + uTime*uFlowSpeed):
//   * Base color = the solid uField (the section's brand color).
//   * The WHITE STROKE texture (uMask.a = stroke coverage, rasterized from the
//     canonical two-layer stroke set) is sampled at a FLOW-WARPED uv so the strokes
//     slowly DRIFT/FLOW across the field — a calm current, never a band sliding.
//   * Domain-warp amplitude scales with uIntensity (subtle drift at low, organic
//     bayou flow at high).
//   * Final color = mix(uField, uStroke, strokeAlpha * uStrokeOpacity). The field is
//     full-bleed, so output alpha is 1.0 (opaque).
//
// BRAND TOKENS: the field color (uField), stroke color (uStroke), stroke opacity
// (uStrokeOpacity) and the flow rate (uFlowSpeed) all arrive as uniforms sourced from
// HISD_TOKENS via tokens.js (or opts.field). No brand hex is ever hardcoded here.
precision mediump float;

in  vec2 vUv;          // [0,1], top-left origin (top of field = y 0)
out vec4 fragColor;

uniform float uTime;        // seconds
uniform vec2  uResolution;  // drawing-buffer px (kept for aspect-correct warp)

// --- brand-token-driven color uniforms (from HISD_TOKENS via tokens.js / opts) ---
uniform vec3  uField;          // solid field color (the section brand color)
uniform vec3  uStroke;         // current-stroke color (#fff)
uniform float uStrokeOpacity;  // group-level stroke multiplier (--ribbon-stroke-opacity)

// --- brand-token-driven motion uniforms ---
uniform float uFlowSpeed;   // from --duration-slower (ms); larger = SLOWER flow
uniform float uIntensity;   // 0..1; scales domain-warp amplitude (drift -> current)

uniform sampler2D uMask;    // rasterized WHITE STROKES; .a = stroke coverage

// @@NOISE@@  <- index.js injects noise.glsl (snoise/fbm/curlNoise) here.

void main() {
  // --- 1. Flow phase (slow). uFlowSpeed is a DURATION in ms (larger = slower), so
  // the rate is proportional to 1/uFlowSpeed. The *1000*0.001 keeps it ~ uTime /
  // durationSeconds and yields a gentle, no-flash drift. Guard against a zero token. --
  float dur = max(uFlowSpeed, 1.0);
  float phase = uTime * (1.0 / dur) * 1000.0 * 0.001; // ~uTime/durationSeconds

  // Aspect-correct the warp domain so the current doesn't smear on wide canvases.
  float aspect = max(uResolution.x, 1.0) / max(uResolution.y, 1.0);
  vec2 p = vec2(vUv.x * aspect, vUv.y);

  // --- 2. Domain warp: a divergence-free curl field nudges the SAMPLE coordinate so
  // the white strokes drift/flow like a current. Amplitude is small and scaled by
  // uIntensity so low intensity = barely-there drift, high intensity = a readable
  // bayou current. Two cheap noise calls only. -------------------------------------
  vec2 flow = curlNoise(p * 1.6 + vec2(phase * 0.6, phase * 0.35));
  // CRISPNESS: the displacement is HALVED vs. the prior amplitudes so the strokes stay
  // sharp while still gently flowing (the old warp smeared the white strokes blurry).
  float warpAmp = mix(0.0075, 0.0425, clamp(uIntensity, 0.0, 1.0));
  // A touch of low-freq fbm adds a second, slower drift so the current breathes.
  vec2 warpExtra = vec2(
    fbm(p * 1.1 + phase * 0.5),
    fbm(p.yx * 1.1 - phase * 0.4)
  ) * mix(0.003, 0.02, clamp(uIntensity, 0.0, 1.0));
  vec2 warpedUv = vUv + flow * warpAmp + warpExtra;

  // --- 3. Sample the white-stroke coverage at the flow-warped uv -------------------
  float strokeA = texture(uMask, warpedUv).a;

  // --- 4. Composite: tone-on-tone white strokes over the solid field --------------
  vec3 col = mix(uField, uStroke, clamp(strokeA * uStrokeOpacity, 0.0, 1.0));

  // --- 5. Output: the field is a full-bleed background -> fully opaque -------------
  fragColor = vec4(col, 1.0);
}

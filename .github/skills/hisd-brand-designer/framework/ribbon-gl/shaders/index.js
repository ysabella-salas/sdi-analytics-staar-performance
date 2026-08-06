// shaders/index.js — ready-to-compile GLSL strings for the Ribbon GL fill.
//
// Exports VERT, FRAG, NOISE as plain JS template-literal strings (GLSL ES 3.00,
// '#version 300 es'). scene.js passes these verbatim to gl.shaderSource — so this is
// CSP-safe: no eval, no inline <script>, no asset fetch, no build step.
//
// PROVENANCE: the strings below are the authored, line-for-line equivalents of the
// sibling source files
//   ribbon.vert.glsl   -> VERT
//   ribbon.frag.glsl   -> FRAG_SRC (authored; contains a `// @@NOISE@@` marker)
//   noise.glsl         -> NOISE
// We can't `import` raw .glsl as strings without a bundler/loader (and we ship zero
// deps + no build), so the canonical text lives here as template literals and the
// .glsl files are the readable, syntax-highlighted mirror. Keep them in sync.
//
// FRAG is assembled by splicing NOISE in at the `// @@NOISE@@` marker, so the
// exported FRAG is a single complete compilable shader with snoise()/curlNoise()/fbm()
// defined before main() uses them.

// ── VERT ───────────────────────────────────────────────────────────────────────
export const VERT = `#version 300 es
// fullscreen-quad vertex shader. aPos is the quad in clip space [-1,1]; we emit a
// top-left-origin [0,1] vUv (y flipped so vUv.y==0 is the TOP of the field, matching
// the 2D-canvas stroke texture sampled at a flow-warped vUv in the fragment shader).
precision mediump float;

in vec2 aPos;
out vec2 vUv;

void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// ── NOISE ──────────────────────────────────────────────────────────────────────
// Body-only GLSL (no #version / precision / main): spliced into FRAG. 2-D simplex
// noise after Ian McEwan / Ashima Arts "webgl-noise" (MIT / public domain), plus a
// curl field and a 2-octave fbm. Mediump-safe and mobile-cheap (no long loops).
export const NOISE = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                          + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float v = snoise(p);
  v += 0.5 * snoise(p * 2.03 + 17.1);
  return v / 1.5;
}

vec2 curlNoise(vec2 p) {
  const float e = 0.12;
  float n1 = snoise(p + vec2(0.0, e));
  float n2 = snoise(p - vec2(0.0, e));
  float n3 = snoise(p + vec2(e, 0.0));
  float n4 = snoise(p - vec2(e, 0.0));
  float dx = (n1 - n2) / (2.0 * e);
  float dy = (n3 - n4) / (2.0 * e);
  return vec2(dx, -dy);
}
`;

// ── FRAG ───────────────────────────────────────────────────────────────────────
// Authored fragment source with a `// @@NOISE@@` splice marker. The NOISE body is
// inserted at the marker so the helpers are defined before main(). The field/stroke
// colors, stroke opacity, and the flow rate arrive as brand-token uniforms
// (HISD_TOKENS via tokens.js / opts.field) — no hardcoded brand hex here.
const FRAG_SRC = `#version 300 es
precision mediump float;

in  vec2 vUv;
out vec4 fragColor;

uniform float uTime;        // seconds
uniform vec2  uResolution;  // drawing-buffer px

// brand-token-driven color uniforms (HISD_TOKENS -> tokens.js / opts.field)
uniform vec3  uField;          // solid field color (the section brand color)
uniform vec3  uStroke;         // current-stroke color (#fff)
uniform float uStrokeOpacity;  // group-level stroke multiplier (--ribbon-stroke-opacity)

// brand-token-driven motion uniforms
uniform float uFlowSpeed;   // --duration-slower (ms); larger = SLOWER flow
uniform float uIntensity;   // 0..1; scales the domain-warp amplitude (drift -> current)

uniform sampler2D uMask;    // rasterized WHITE STROKES; .a = stroke coverage

// @@NOISE@@

void main() {
  // 1. Slow flow phase. uFlowSpeed is a DURATION in ms (larger = slower), so the
  // rate ~ 1/uFlowSpeed; *1000*0.001 keeps it ~ uTime / durationSeconds. No flash.
  float dur = max(uFlowSpeed, 1.0);
  float phase = uTime * (1.0 / dur) * 1000.0 * 0.001;

  // Aspect-correct the warp domain so the current doesn't smear on wide canvases.
  float aspect = max(uResolution.x, 1.0) / max(uResolution.y, 1.0);
  vec2 p = vec2(vUv.x * aspect, vUv.y);

  // 2. Divergence-free curl warp of the SAMPLE coordinate so the white strokes
  // drift/flow like a current; amplitude scaled by intensity. A slower fbm drift is
  // layered on so the current breathes. A few cheap noise calls only.
  vec2 flow = curlNoise(p * 1.6 + vec2(phase * 0.6, phase * 0.35));
  // CRISPNESS: displacement HALVED vs. the prior amplitudes so the strokes stay sharp
  // while still gently flowing (the old warp smeared the white strokes blurry).
  float warpAmp = mix(0.0075, 0.0425, clamp(uIntensity, 0.0, 1.0));
  vec2 warpExtra = vec2(
    fbm(p * 1.1 + phase * 0.5),
    fbm(p.yx * 1.1 - phase * 0.4)
  ) * mix(0.003, 0.02, clamp(uIntensity, 0.0, 1.0));
  vec2 warpedUv = vUv + flow * warpAmp + warpExtra;

  // 3. Sample the white-stroke coverage at the flow-warped uv.
  float strokeA = texture(uMask, warpedUv).a;

  // 4. Composite tone-on-tone white strokes over the solid field.
  vec3 col = mix(uField, uStroke, clamp(strokeA * uStrokeOpacity, 0.0, 1.0));

  // 5. Full-bleed background -> fully opaque.
  fragColor = vec4(col, 1.0);
}
`;

// Splice NOISE into FRAG_SRC at the marker -> a single complete compilable shader.
// If the marker is ever removed, fall back to inserting NOISE right after the precision
// line so FRAG stays compilable.
export const FRAG = FRAG_SRC.includes('// @@NOISE@@')
  ? FRAG_SRC.replace('// @@NOISE@@', NOISE)
  : FRAG_SRC.replace('precision mediump float;', 'precision mediump float;\n' + NOISE);

export default { VERT, FRAG, NOISE };

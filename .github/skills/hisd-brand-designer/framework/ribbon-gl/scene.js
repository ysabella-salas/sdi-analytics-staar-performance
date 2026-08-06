// scene.js — raw WebGL2 scene for the animated HISD Ribbon (rung 2).
//
// Zero dependencies. This module owns the GL context, the fullscreen-quad geometry,
// the program built from the GLSL strings in ./shaders/index.js, the field/stroke/flow
// uniforms, and the WHITE-STROKE texture (the canonical "bayou current" strokes,
// rasterized by core.js and handed to us via setMask). It draws one frame per render():
// a solid brand-color FIELD with the white strokes flow-warped over it.
//
// COLOR PROVENANCE: the field color arrives through setTokens(tokens) / setField(css),
// the stroke color + opacity through setTokens(tokens). Nothing here hardcodes a brand
// hex — the only literals are neutral GL defaults (black field / white stroke), seeded
// before the first setTokens and immediately overwritten at construction.
//
// Public API (frozen — see README / core.js):
//   createScene(canvas, { tokens, intensity, field }) -> {
//     render(timeSeconds), resize(cssW, cssH, dpr), setTokens(tokens),
//     setField(cssColor), setMask(image), dispose(),
//     onContextLost(cb), onContextRestored(cb)
//   }
//
// Uniform contract shared with the shader:
//   uTime(float s), uResolution(vec2 px), uField(vec3), uStroke(vec3),
//   uStrokeOpacity(float), uFlowSpeed(float), uIntensity(float), uMask(sampler2D).

import { VERT, FRAG } from './shaders/index.js';

// Fullscreen quad as two triangles. Interleaved? No — we keep it simple: one buffer
// of clip-space positions doubling as UVs via a tiny remap in the vertex shader. To
// avoid coupling to the shader's exact attribute math we ship explicit UVs alongside
// positions in a single interleaved buffer: [x, y, u, v] per vertex.
//
// Clip space spans [-1, 1]; UV spans [0, 1] with v flipped so vUv.y=0 is the TOP of
// the field (matching how the stroke texture is rasterized: y=0 at the top).
//   position (clip)        uv
//   (-1,-1) bottom-left     (0, 1)
//   ( 1,-1) bottom-right    (1, 1)
//   (-1, 1) top-left        (0, 0)
//   ( 1, 1) top-right       (1, 0)
const QUAD = new Float32Array([
  // x,   y,    u,   v
  -1, -1, 0, 1,
   1, -1, 1, 1,
  -1,  1, 0, 0,
  -1,  1, 0, 0,
   1, -1, 1, 1,
   1,  1, 1, 0,
]);
const FLOATS_PER_VERT = 4;
const VERT_COUNT = QUAD.length / FLOATS_PER_VERT;

// A dispose-only stub returned when GL bring-up fails, so the host can demote to CSS
// without special-casing. Every method is a safe no-op; dispose runs the cleanup we
// were given (if any) exactly once.
function makeDisposedStub(cleanup) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    try { typeof cleanup === 'function' && cleanup(); } catch { /* ignore */ }
  };
  return {
    render() {},
    resize() {},
    setTokens() {},
    setField() {},
    setMask() {},
    dispose: run,
    onContextLost() {},
    onContextRestored() {},
  };
}

// Compile a single shader stage; logs and returns null on failure.
function compileShader(gl, type, source, label) {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    console.warn(`[ribbon-gl] ${label} shader compile failed:\n${log}`);
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

// Link vertex + fragment into a program; logs and returns null on failure.
function linkProgram(gl, vs, fs) {
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    console.warn(`[ribbon-gl] program link failed:\n${log}`);
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

// Coerce a token vec3 to a finite [r,g,b]; defaults to black if absent/malformed.
function vec3(c) {
  if (Array.isArray(c)) {
    return [+c[0] || 0, +c[1] || 0, +c[2] || 0];
  }
  return [0, 0, 0];
}

// Parse a CSS color string -> [r,g,b] in 0..1 sRGB, or null if unparseable. Handles
// the forms the host hands us: '#rgb' / '#rrggbb' hex, and 'rgb()/rgba()' (the form
// getComputedStyle(host).backgroundColor returns). This lets setField() accept either
// an explicit opts.field color or a computed background-color. No brand hex literals.
function cssColorToVec3(css) {
  if (typeof css !== 'string') return null;
  const s = css.trim();
  if (!s) return null;
  // Hex (#rgb / #rrggbb), with or without '#'.
  let h = s[0] === '#' ? s.slice(1) : s;
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (/^[0-9a-fA-F]{6}$/.test(h)) {
    const n = parseInt(h, 16);
    return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
  }
  // rgb()/rgba(): pull the first three numeric channels (0..255).
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const parts = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat);
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      return [
        clamp01(parts[0] / 255),
        clamp01(parts[1] / 255),
        clamp01(parts[2] / 255),
      ];
    }
  }
  return null;
}

/**
 * createScene(canvas, { tokens, intensity, field }) -> scene controller (see header).
 * `field` is an optional CSS color for the solid field; if omitted the field comes
 * from tokens.field (else a neutral default until setField/setTokens runs).
 * Returns a dispose-only stub (never throws) if WebGL2 / compile / link fails, so the
 * host can demote to the CSS tier.
 */
export function createScene(canvas, { tokens, intensity = 0.6, field } = {}) {
  // ── Acquire WebGL2 ────────────────────────────────────────────────────────────
  // The field is a full-bleed OPAQUE background, so we don't need the canvas itself
  // to be alpha-blended over the host; but we keep alpha:true + straight alpha so the
  // crossfade-in (canvas opacity) reveals it cleanly. antialias off (the stroke edges
  // come from the LINEAR stroke texture). depth/stencil unused.
  let gl = null;
  try {
    gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      desynchronized: true,
      powerPreference: 'low-power',
      preserveDrawingBuffer: false,
    });
  } catch {
    gl = null;
  }
  if (!gl) {
    console.warn('[ribbon-gl] WebGL2 context unavailable; demoting.');
    return makeDisposedStub(null);
  }

  // ── Build the program ─────────────────────────────────────────────────────────
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT, 'vertex');
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG, 'fragment');
  const program = vs && fs ? linkProgram(gl, vs, fs) : null;
  // Shaders can be detached/deleted once linked.
  if (vs) gl.deleteShader(vs);
  if (fs) gl.deleteShader(fs);
  if (!program) {
    return makeDisposedStub(() => {
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) try { lose.loseContext(); } catch { /* ignore */ }
    });
  }

  // ── Geometry: VAO + interleaved quad buffer ───────────────────────────────────
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);

  // The vertex shader declares a single clip-space attribute `aPos` (it derives vUv
  // internally with the top-left y-flip), so the position is what we must bind. We
  // also probe legacy attribute names (`aPosition`/`aUv`) and bind whichever the
  // program actually exposes, so this stays correct if the shader is ever reworked to
  // take explicit UVs from the interleaved buffer.
  const aPos = gl.getAttribLocation(program, 'aPos');
  const aPosition = gl.getAttribLocation(program, 'aPosition');
  const aUv = gl.getAttribLocation(program, 'aUv');
  const stride = FLOATS_PER_VERT * 4; // bytes per vertex
  // Position attribute (clip-space x,y) at offset 0 — bind whichever name the shader
  // declared for the position (`aPos` in the current shader, `aPosition` if reworked).
  const posLoc = aPos >= 0 ? aPos : aPosition;
  if (posLoc >= 0) {
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, stride, 0);
  }
  // Optional explicit UV attribute — only present if a future shader declares aUv;
  // the current shader derives vUv from aPos, so this is a no-op then.
  if (aUv >= 0) {
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, stride, 2 * 4);
  }
  gl.bindVertexArray(null);

  // ── Uniform locations ─────────────────────────────────────────────────────────
  const loc = {
    uTime: gl.getUniformLocation(program, 'uTime'),
    uResolution: gl.getUniformLocation(program, 'uResolution'),
    uField: gl.getUniformLocation(program, 'uField'),
    uStroke: gl.getUniformLocation(program, 'uStroke'),
    uStrokeOpacity: gl.getUniformLocation(program, 'uStrokeOpacity'),
    uFlowSpeed: gl.getUniformLocation(program, 'uFlowSpeed'),
    uIntensity: gl.getUniformLocation(program, 'uIntensity'),
    uMask: gl.getUniformLocation(program, 'uMask'),
  };

  // ── Stroke texture ────────────────────────────────────────────────────────────
  // The uMask texture is the rasterized WHITE STROKES (.a = stroke coverage), uploaded
  // in setMask. RGBA, straight (non-premultiplied) alpha, CLAMP_TO_EDGE, LINEAR. Until
  // it is uploaded, uMask reads as fully transparent (we seed a 1x1 transparent texel
  // so the sampler is always valid — the field then shows with no strokes).
  let maskTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, maskTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // 1x1 transparent black seed.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 0]),
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
  let hasMask = false;

  // ── Static GL state ───────────────────────────────────────────────────────────
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  // The field is a full-bleed OPAQUE background (fragColor.a == 1), so it fully
  // replaces the cleared buffer. We keep straight-alpha blending enabled (harmless at
  // alpha 1) so the host can still see the canvas crossfade in via CSS opacity.
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  // ── Uniform values (CPU-side cache, pushed on demand) ─────────────────────────
  let curIntensity = clamp01(intensity);
  let resW = canvas.width || 1;
  let resH = canvas.height || 1;
  // An explicit opts.field (or a later setField) PINS the field color and wins over
  // tokens.field on retheme; until pinned, the field tracks tokens.field. Stored as a
  // resolved [r,g,b] (or null = "use tokens").
  let pinnedField = cssColorToVec3(field);

  // Bind the program once and seed everything that doesn't change per frame.
  gl.useProgram(program);
  if (loc.uMask) gl.uniform1i(loc.uMask, 0); // sampler -> TEXTURE0
  if (loc.uIntensity) gl.uniform1f(loc.uIntensity, curIntensity);
  // Seed a neutral default field/stroke so the first frame is valid even before tokens
  // (black field, white strokes). applyTokens() immediately overwrites these.
  if (loc.uField) gl.uniform3f(loc.uField, 0, 0, 0);
  if (loc.uStroke) gl.uniform3f(loc.uStroke, 1, 1, 1);
  if (loc.uStrokeOpacity) gl.uniform1f(loc.uStrokeOpacity, 0.16);

  // Apply the initial tokens. setTokens is also the retheme path.
  applyTokens(tokens);

  // ── Context-loss/restore plumbing ─────────────────────────────────────────────
  // core.js also listens on the canvas and preventDefaults; we expose hooks so the
  // host can react. We register our own listeners to drive the registered callbacks.
  let onLostCb = null;
  let onRestoredCb = null;
  const handleLost = (e) => {
    // core.js calls preventDefault; we do too defensively so a standalone scene
    // (no core wrapper) still keeps the context restorable.
    try { e.preventDefault(); } catch { /* ignore */ }
    if (typeof onLostCb === 'function') { try { onLostCb(e); } catch { /* ignore */ } }
  };
  const handleRestored = (e) => {
    if (typeof onRestoredCb === 'function') { try { onRestoredCb(e); } catch { /* ignore */ } }
  };
  try {
    canvas.addEventListener('webglcontextlost', handleLost, false);
    canvas.addEventListener('webglcontextrestored', handleRestored, false);
  } catch { /* canvas may be a bare stub; ignore */ }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  function applyTokens(tk) {
    if (!tk) return;
    gl.useProgram(program);
    // Field: an explicit pinned field (opts.field / setField) wins; else tokens.field.
    const fieldVec = pinnedField || vec3(tk.field);
    if (loc.uField) gl.uniform3f(loc.uField, fieldVec[0], fieldVec[1], fieldVec[2]);
    // Stroke color (white) + group-level opacity multiplier.
    const stroke = vec3(tk.stroke);
    if (loc.uStroke) gl.uniform3f(loc.uStroke, stroke[0], stroke[1], stroke[2]);
    const so = Number(tk.strokeOpacity);
    if (loc.uStrokeOpacity) {
      gl.uniform1f(loc.uStrokeOpacity, Number.isFinite(so) && so >= 0 ? so : 0.16);
    }
    // flowSpeedMs -> a per-second flow rate. Larger duration => slower flow. Guard
    // against zero/NaN so the animation never stalls or explodes.
    const ms = Number(tk.flowSpeedMs);
    const flow = Number.isFinite(ms) && ms > 0 ? 1000 / ms : 2.0;
    if (loc.uFlowSpeed) gl.uniform1f(loc.uFlowSpeed, flow);
  }

  // setField(cssColor): pin the solid field to a CSS color (opts.field semantics at
  // runtime). Passing null/'' un-pins so the field tracks tokens.field again. Returns
  // silently on an unparseable color (keeps the previous field).
  function setFieldColor(css) {
    if (css == null || css === '') { pinnedField = null; return; }
    const v = cssColorToVec3(css);
    if (!v) return;
    pinnedField = v;
    if (gl && loc.uField) {
      gl.useProgram(program);
      gl.uniform3f(loc.uField, v[0], v[1], v[2]);
    }
  }

  // ── Public methods ────────────────────────────────────────────────────────────
  function render(timeSeconds) {
    if (!gl || gl.isContextLost()) return;
    gl.viewport(0, 0, resW, resH);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    if (loc.uTime) gl.uniform1f(loc.uTime, +timeSeconds || 0);
    if (loc.uResolution) gl.uniform2f(loc.uResolution, resW, resH);
    // Bind the mask on unit 0.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, VERT_COUNT);
    gl.bindVertexArray(null);
  }

  function resize(cssW, cssH, dpr) {
    if (!gl) return;
    const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
    const w = Math.max(1, Math.round((+cssW || 1) * d));
    const h = Math.max(1, Math.round((+cssH || 1) * d));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    resW = w;
    resH = h;
    gl.viewport(0, 0, resW, resH);
  }

  function setTokens(tk) {
    applyTokens(tk);
  }

  function setField(css) {
    setFieldColor(css);
  }

  function setMask(image) {
    if (!gl || !image) return;
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      hasMask = true;
    } catch (err) {
      console.warn('[ribbon-gl] mask upload failed:', err);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    try {
      canvas.removeEventListener('webglcontextlost', handleLost, false);
      canvas.removeEventListener('webglcontextrestored', handleRestored, false);
    } catch { /* ignore */ }
    if (gl) {
      try {
        if (vbo) gl.deleteBuffer(vbo);
        if (vao) gl.deleteVertexArray(vao);
        if (maskTex) gl.deleteTexture(maskTex);
        if (program) gl.deleteProgram(program);
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      } catch { /* ignore */ }
    }
    maskTex = null;
    gl = null;
    onLostCb = null;
    onRestoredCb = null;
  }

  function onContextLost(cb) { onLostCb = typeof cb === 'function' ? cb : null; }
  function onContextRestored(cb) { onRestoredCb = typeof cb === 'function' ? cb : null; }

  return {
    render,
    resize,
    setTokens,
    setField,
    setMask,
    dispose,
    onContextLost,
    onContextRestored,
  };
}

function clamp01(n) {
  const v = +n;
  if (!Number.isFinite(v)) return 0.6;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export default createScene;

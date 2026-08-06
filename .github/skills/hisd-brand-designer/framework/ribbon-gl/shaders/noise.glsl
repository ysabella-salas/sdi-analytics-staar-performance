// noise.glsl — compact, dependency-free GLSL noise for the Ribbon domain-warp.
//
// Body-only GLSL (no '#version', no precision, no main): index.js concatenates this
// into the fragment shader source between the FRAG header and the FRAG body so the
// noise helpers are available to the flow code. Keep it self-contained (no uniforms,
// no varyings) so it stays portable and cheap.
//
// 2-D simplex noise after Ian McEwan / Ashima Arts ("webgl-noise", MIT / public
// domain) — the canonical Stefan Gustavson formulation. We expose:
//   float snoise(vec2 v)          -> simplex noise in ~[-1, 1]
//   vec2  curlNoise(vec2 p)       -> divergence-free 2-D flow field from noise grads
//   float fbm(vec2 p)             -> 2-octave fractional Brownian motion (cheap)
//
// All mediump-safe; no loops longer than 2 iterations so it stays mobile-cheap.

// --- Ashima webgl-noise helpers ------------------------------------------------
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

// 2-D simplex noise. Returns roughly [-1, 1].
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187,  // (3.0 - sqrt(3.0)) / 6.0
                      0.366025403784439,  // 0.5 * (sqrt(3.0) - 1.0)
                     -0.577350269189626,  // -1.0 + 2.0 * C.x
                      0.024390243902439); // 1.0 / 41.0
  // First corner.
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  // Other corners.
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  // Permutations.
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                          + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  // Gradients: 41 points uniformly over a line, mapped onto a diamond.
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  // Normalise gradients implicitly by scaling m.
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  // Compute final noise value at P.
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// 2-octave fbm — enough texture for a slow current without extra cost.
float fbm(vec2 p) {
  float v = snoise(p);
  v += 0.5 * snoise(p * 2.03 + 17.1);
  return v / 1.5; // keep roughly in [-1, 1]
}

// Divergence-free curl of a 2-D scalar noise potential. This yields a swirling,
// volume-preserving flow field (no sources/sinks), which reads as a natural
// "bayou current" rather than a uniform push. Cheap finite-difference gradient.
vec2 curlNoise(vec2 p) {
  const float e = 0.12;          // sample offset; larger = smoother, cheaper-feeling
  float n1 = snoise(p + vec2(0.0, e));
  float n2 = snoise(p - vec2(0.0, e));
  float n3 = snoise(p + vec2(e, 0.0));
  float n4 = snoise(p - vec2(e, 0.0));
  // curl of potential phi: (dphi/dy, -dphi/dx)
  float dx = (n1 - n2) / (2.0 * e);
  float dy = (n3 - n4) / (2.0 * e);
  return vec2(dx, -dy);
}

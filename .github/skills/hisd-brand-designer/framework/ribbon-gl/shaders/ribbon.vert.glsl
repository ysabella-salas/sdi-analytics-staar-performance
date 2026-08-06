#version 300 es
// ribbon.vert.glsl — fullscreen-quad vertex shader for the Ribbon GL fill.
//
// The scene draws a single full-canvas triangle/quad whose clip-space positions are
// supplied in aPos (range [-1, 1]). We derive a normalized [0,1] UV from clip space
// and pass it to the fragment shader as vUv. The fragment shader fills the solid field
// and samples uMask (the canonical WHITE STROKES) at a flow-warped vUv.
//
// vUv origin: top-left. Clip-space y is +up, but the mask is rasterized in a 2D
// canvas whose y is +down; we flip y here so vUv.y == 0 is the TOP of the field
// (matching the rasterized stroke texture's orientation).
precision mediump float;

in vec2 aPos;   // fullscreen quad corners in clip space, [-1, 1]
out vec2 vUv;   // [0, 1], top-left origin

void main() {
  // clip [-1,1] -> uv [0,1]; flip y so 0 = top.
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}

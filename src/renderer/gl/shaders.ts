/** Output-space (0..1, top-left origin) → clip space. */
export const SURFACE_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;
out vec2 vUv;
void main() {
  vUv = aUv;
  gl_Position = vec4(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0, 0.0, 1.0);
}`;

export const SURFACE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform sampler2D uMask;
uniform vec4 uRect;       // mesh UV origin and size
uniform vec4 uBounds;     // allowed region in the source texture
uniform vec2 uSampleCenter;
uniform vec4 uSampleAxes; // source UV axes for the unwarped surface
uniform vec2 uHalfTexel; // half a source texel in UV
uniform vec2 uSize;      // drawing buffer size, px
uniform float uOpacity;
out vec4 outColor;
void main() {
  vec2 local = (vUv - uRect.xy) / uRect.zw - 0.5;
  vec2 sampleUv = uSampleCenter + uSampleAxes.xy * local.x + uSampleAxes.zw * local.y;
  vec2 end = uBounds.xy + uBounds.zw;
  if (any(lessThan(sampleUv, uBounds.xy - 0.000001)) ||
      any(greaterThan(sampleUv, end + 0.000001))) discard;
  vec2 inset = min(uHalfTexel, uBounds.zw * 0.5);
  vec2 uv = clamp(sampleUv, uBounds.xy + inset, end - inset);
  // Mask texture is rendered in framebuffer orientation, so gl_FragCoord indexes it directly.
  float m = texture(uMask, gl_FragCoord.xy / uSize).r;
  float a = m * uOpacity;
  outColor = vec4(texture(uSrc, uv).rgb * a, a);
}`;

/** Flat-colour lines/points for the edit overlay; positions in output space. */
export const FLAT_VS = `#version 300 es
layout(location = 0) in vec2 aPos;
uniform float uPointSize;
void main() {
  gl_PointSize = uPointSize;
  gl_Position = vec4(aPos.x * 2.0 - 1.0, 1.0 - aPos.y * 2.0, 0.0, 1.0);
}`;

export const FLAT_FS = `#version 300 es
precision mediump float;
uniform vec4 uColor;
out vec4 outColor;
void main() { outColor = uColor; }`;

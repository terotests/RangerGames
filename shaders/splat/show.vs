#version 300 es
// A full-picture quad for the splats' show passes (liquid, gas).
layout(location=0) in vec2 q;
out vec2 uv;
void main() { uv = q * 0.5 + 0.5; gl_Position = vec4(q, 0.0, 1.0); }

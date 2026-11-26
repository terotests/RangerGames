// The engine's own liquid look as a hook (what show.fs draws, with the
// smoother normal), and a starting point for a game's own: copy it into the
// game's folder, e.g. shaders/magma.glsl, and register it with
//   rg.shader("magma", { src: "shaders/magma.glsl", kind: "liquid" });
//   rg.three("add", { id: "m", shape: "splats", src: "x.rgps", material: { shader: "magma", u: { glow: 1 } } });
vec4 liquid(Fluid f) {
  float dif = 0.45 + 0.55 * max(dot(f.n, f.sun), 0.0);
  float spec = pow(max(dot(reflect(-f.sun, f.n), f.view), 0.0), 28.0) * 0.5;
  // hot glows of itself (less shading), cold is lit
  float glow = smoothstep(0.35, 0.9, f.temp);
  vec3 lit = f.pal * mix(dif, 1.0, glow * 0.7) + spec * mix(vec3(1.0), f.pal, 0.4);
  float halo = smoothstep(0.02, 0.3, f.thick) * 0.35 * (0.3 + glow);
  float a = max(f.edge, halo);
  return vec4(mix(f.pal * (0.6 + glow), lit, f.edge), a);
}

// The engine's own mesh(): the colour it worked out at the corners. A game's
// hook starts from here (rg.shader kind "mesh", shaders/README.md).
vec4 mesh(Mesh m) {
  return vec4(m.col, 1.0);
}

// The engine's own surface hook for globes: keeps what the engine drew. A
// game's own starts from here: copy it into the game's folder, e.g.
// shaders/lava.glsl, and register it with
//   rg.shader("lava", { src: "shaders/lava.glsl", kind: "surface" });
//   rg.three("planet", { id: "p", texture: "img/p.jpg", material: { shader: "lava", u: { glow: 1 } } });
// Surface: p the point on the ball (unit, the planet's own frame: z its pole),
// n its shading normal, uv the map's (u, v), col the colour the engine has
// drawn (lit), sun towards the sun, view towards the eye, t the planet's
// flowTime, light the sunlight on the slope (0..1, more on bright slopes),
// day the sun's height there (dot(p, sun), below 0 at night).
vec3 surface(Surface s) {
  return s.col;
}

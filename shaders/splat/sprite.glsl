// The engine's own sprite look: a soft round glow in the palette's colour,
// added to what is behind. A game's own starts from here: copy it into the
// game's folder, e.g. shaders/spark.glsl, and register it with
//   rg.shader("spark", { src: "shaders/spark.glsl", kind: "sprite" });
//   rg.three("add", { id: "b", shape: "burst", look: "glow", material: { shader: "spark", u: { hot: 1 } } });
vec4 sprite(Sprite s) {
  return spriteColor(s.pal, softSprite(s.uv), 1.0);
}

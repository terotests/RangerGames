// Air lit by the sun, after Sean O'Neil, "Accurate Atmospheric Scattering" (GPU Gems 2, ch. 16).
// Units: the planet's radius is 1, the air reaches 1 + atm. The air thins as exp(-h / H) with H a quarter of
// its height (O'Neil's scale depth 0.25), and the optical depth from a point to the top along a direction is
// read from a fitted curve (scatterScale) instead of a second integral, so a ray needs only a few samples.
//
// kr: the Rayleigh scattering per colour (the air's colour: blue air scatters blue, 1/λ⁴ for the Earth is about
// (0.29, 0.48, 1.0)); mie: dust and haze, grey, scattered forwards (g); gain: the sunlight's strength.
// The results are light in the scene's units before tone mapping (scatterTone).

const float SC_H = 0.25;            // the scale depth, as a share of the air's height
const float SC_KR = 0.0025 * 12.566 * 19.6;   // O'Neil's Kr 4π for the bluest channel (1/0.475⁴ = 19.6)
const float SC_KM = 0.0010 * 12.566;          // Km 4π
const float SC_SUN = 12.0;          // ESun (O'Neil 20: too washed over a lit ground)

// the optical depth to the top of the air from a point at the bottom, along a direction at cos c to the
// vertical, in units of the vertical one × SC_H (O'Neil's fit for a scale depth of 0.25)
float scatterScale(float c) {
  float x = 1.0 - c;
  return SC_H * exp(-0.00287 + x * (0.459 + x * (3.83 + x * (-6.80 + x * 5.25))));
}

// the ray o + d t through the shell 1..1+atm: its part in the air (t0, t1), and whether it ends on the ground
bool scatterSpan(vec3 o, vec3 d, float atm, out float t0, out float t1, out bool ground) {
  float R = 1.0 + atm; float b = dot(o, d); float c = dot(o, o);
  float da = b * b - c + R * R; ground = false;
  if (da <= 0.0) return false;
  float sa = sqrt(da); t0 = max(-b - sa, 0.0); t1 = -b + sa;
  if (t1 <= 0.0) return false;
  float dg = b * b - c + 1.0;
  if (dg > 0.0) { float tg = -b - sqrt(dg); if (tg > 0.0) { t1 = tg; ground = true; } }
  return t1 > t0;
}

float scatterDepth(float r, float atm) { return exp((1.0 - r) / (atm * SC_H)); }

// Rayleigh and Mie phase functions (cs: cos of the angle between the ray and the sun)
float scatterPhaseR(float cs) { return 0.75 * (1.0 + cs * cs); }
float scatterPhaseM(float cs, float g) {
  float g2 = g * g;
  return 1.5 * ((1.0 - g2) / (2.0 + g2)) * (1.0 + cs * cs) / pow(max(1.0 + g2 - 2.0 * g * cs, 1e-4), 1.5);
}

// Light scattered towards the eye along o + d t, t0..t1 (n samples). ground: the ray ends on the ground, then
// O'Neil's ground form (the angles at the ground point stand for the whole ray) and ext is how much of the
// ground's own colour comes through (per channel); otherwise ext is how much of what lies behind comes through.
vec3 scatterRay(vec3 o, vec3 d, vec3 sun, float atm, vec3 kr, float mie, float g, float gain, float t0, float t1,
    bool ground, out vec3 ext) {
  vec3 k = kr * SC_KR + vec3(mie * SC_KM);
  float sc = 1.0 / atm;                // scale: lengths in air heights
  float len = (t1 - t0) / 4.0;
  vec3 s = o + d * t0; float rs = length(s);
  float ds = scatterDepth(rs, atm);
  vec3 acc = vec3(0.0); vec3 att = vec3(1.0);
  if (ground) {
    vec3 pg = normalize(o + d * t1);
    float cam = scatterScale(dot(-d, pg)), lit = scatterScale(dot(sun, pg));
    float off = ds * cam;
    for (int i = 0; i < 4; i++) {
      vec3 p = s + d * (len * (float(i) + 0.5)); float dp = scatterDepth(length(p), atm);
      float od = max(dp * (lit + cam) - off, 0.0);
      att = exp(-od * k); acc += att * dp;
    }
    ext = exp(-max(cam - off, 0.0) * k);
  } else {
    float off = ds * scatterScale(dot(d, s) / rs);
    for (int i = 0; i < 4; i++) {
      vec3 p = s + d * (len * (float(i) + 0.5)); float r = length(p); float dp = scatterDepth(r, atm);
      vec3 pn = p / r;
      float cd = scatterScale(dot(d, pn));
      float od = max(off + dp * (scatterScale(dot(sun, pn)) - cd), 0.0);
      att = exp(-od * k); acc += att * dp;
    }
    vec3 e = o + d * t1; float re = length(e);
    ext = exp(-max(off - scatterDepth(re, atm) * scatterScale(dot(d, e) / re), 0.0) * k);
  }
  acc *= len * sc;
  float cs = dot(d, sun);
  return gain * SC_SUN * acc * (kr * (SC_KR / 12.566) * scatterPhaseR(cs) + vec3(mie * (SC_KM / 12.566)) * scatterPhaseM(cs, g));
}

// HDR light to 0..1 (O'Neil's exposure curve)
vec3 scatterTone(vec3 c) { return 1.0 - exp(-c * 2.0); }

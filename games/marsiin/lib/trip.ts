// The flight to Mars on a Hohmann transfer orbit: half an ellipse around the
// Sun from the Earth's orbit (1 AU) to Mars's (1.524 AU), 259 days. Mars must
// be 44° ahead of the Earth at departure to be where the ship arrives. Real
// distances, so the light's delay to the Earth and how big the planets look
// out of the window are true.

export const AU = 149597871;           // km
export const C_KM_S = 299792.458;
export const R_EARTH = 6371, R_MARS = 3389.5, R_SUN = 696000;
const A_E = 1.0, A_M = 1.5237;
const T_E = 365.256, T_M = 686.98;
const A_T = (A_E + A_M) / 2, E_T = (A_M - A_E) / (A_M + A_E);
export const TRANSFER_DAYS = Math.sqrt(A_T * A_T * A_T) * T_E / 2;   // half the period: 258.9
const MARS0 = Math.PI - 2 * Math.PI * TRANSFER_DAYS / T_M;

export type Where = { ship: number[]; earth: number[]; mars: number[]; dEarth: number; dMars: number; dSun: number; delay: number };

// where everything is on day t (0 = leaving the Earth), in km around the Sun
export function where(t: number): Where {
  const n = 2 * Math.PI / (2 * TRANSFER_DAYS);       // the transfer orbit's mean motion (rad/day)
  const M = Math.min(Math.PI, n * t);
  let E = M;
  for (let i = 0; i < 12; i++) E = E - (E - E_T * Math.sin(E) - M) / (1 - E_T * Math.cos(E));
  const nu = 2 * Math.atan2(Math.sqrt(1 + E_T) * Math.sin(E / 2), Math.sqrt(1 - E_T) * Math.cos(E / 2));
  const r = A_T * (1 - E_T * Math.cos(E)) * AU;
  const ship = [r * Math.cos(nu), r * Math.sin(nu)];
  const ae = 2 * Math.PI * t / T_E, am = MARS0 + 2 * Math.PI * t / T_M;
  const earth = [A_E * AU * Math.cos(ae), A_E * AU * Math.sin(ae)];
  const mars = [A_M * AU * Math.cos(am), A_M * AU * Math.sin(am)];
  const dEarth = Math.hypot(ship[0] - earth[0], ship[1] - earth[1]);
  const dMars = Math.hypot(ship[0] - mars[0], ship[1] - mars[1]);
  const dSun = Math.hypot(ship[0], ship[1]);
  return { ship, earth, mars, dEarth, dMars, dSun, delay: dEarth / C_KM_S };
}

// the angle at the ship between two directions (the Sun and a planet: how lit it looks)
export function angleAt(p: number[], a: number[], b: number[]): number {
  const ax = a[0] - p[0], ay = a[1] - p[1], bx = b[0] - p[0], by = b[1] - p[1];
  const c = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

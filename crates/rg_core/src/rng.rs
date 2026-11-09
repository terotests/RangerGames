// SPDX-License-Identifier: AGPL-3.0-or-later
//! A seeded random number generator that gives the same numbers on every
//! target: Park and Miller's "minimal standard" generator (multiplier 48271,
//! modulus 2^31 - 1). Its products stay below 2^47, exact in an i64 and in
//! a JavaScript number alike, so the JavaScript target and the script
//! runtime's `rg.random()` give the very numbers the Rust build gives.

use ranger::prelude::*;

#[derive(Clone)]
pub struct Rng {
    state: int,
}

impl Rng {
    pub fn new(seed: int) -> Rng {
        let mut s = seed % 2147483647;
        if s < 0 {
            s = s + 2147483647;
        }
        if s == 0 {
            s = 1;
        }
        Rng { state: s }
    }

    /// The next number in 1 ..= 2^31 - 2.
    pub fn next_int(&mut self) -> int {
        self.state = (self.state * 48271) % 2147483647;
        self.state
    }

    /// A number in (0, 1).
    pub fn next(&mut self) -> double {
        (self.next_int() as f64) / 2147483647.0
    }

    /// An integer in [lo, hi].
    pub fn range(&mut self, lo: int, hi: int) -> int {
        if hi <= lo {
            return lo;
        }
        lo + (self.next_int() % (hi - lo + 1))
    }
}

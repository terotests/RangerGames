// SPDX-License-Identifier: AGPL-3.0-or-later
//! A seeded random number generator (a 31-bit linear congruential one) that
//! gives the same numbers on every target: the products stay below 2^62, so
//! no target overflows.

use ranger::prelude::*;

#[derive(Clone)]
pub struct Rng {
    state: int,
}

impl Rng {
    pub fn new(seed: int) -> Rng {
        let mut s = seed % 2147483648;
        if s < 0 {
            s = s + 2147483648;
        }
        Rng { state: s }
    }

    /// The next number in 0 ..= 2^31 - 1.
    pub fn next_int(&mut self) -> int {
        self.state = (self.state * 1103515245 + 12345) % 2147483648;
        self.state
    }

    /// A number in [0, 1).
    pub fn next(&mut self) -> double {
        (self.next_int() as f64) / 2147483648.0
    }

    /// An integer in [lo, hi].
    pub fn range(&mut self, lo: int, hi: int) -> int {
        if hi <= lo {
            return lo;
        }
        lo + (self.next_int() % (hi - lo + 1))
    }
}

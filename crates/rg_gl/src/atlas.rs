// SPDX-License-Identifier: AGPL-3.0-or-later
//! Places rectangles (text runs) on one big texture, shelf by shelf.

pub struct Shelves {
    pub w: i32,
    pub h: i32,
    shelves: Vec<(i32, i32, i32)>, // y, height, x used
    bottom: i32,
}

impl Shelves {
    pub fn new(w: i32, h: i32) -> Shelves {
        Shelves { w, h, shelves: Vec::new(), bottom: 0 }
    }

    pub fn clear(&mut self) {
        self.shelves.clear();
        self.bottom = 0;
    }

    /// A free place for w × h (with a pixel between neighbours), or None when full.
    pub fn place(&mut self, w: i32, h: i32) -> Option<(i32, i32)> {
        let (w, h) = (w + 1, h + 1);
        if w > self.w || h > self.h {
            return None;
        }
        // the lowest shelf it fits on without wasting more than half the shelf
        let mut best: Option<usize> = None;
        for (i, s) in self.shelves.iter().enumerate() {
            if s.1 >= h && s.1 <= h * 2 && s.2 + w <= self.w && best.map_or(true, |b| self.shelves[b].1 > s.1) {
                best = Some(i);
            }
        }
        if let Some(i) = best {
            let s = &mut self.shelves[i];
            let at = (s.2, s.0);
            s.2 += w;
            return Some(at);
        }
        if self.bottom + h > self.h {
            return None;
        }
        let y = self.bottom;
        self.shelves.push((y, h, w));
        self.bottom += h;
        Some((0, y))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn places_side_by_side_then_below_then_full() {
        let mut s = Shelves::new(100, 30);
        assert_eq!(s.place(40, 9), Some((0, 0)));
        assert_eq!(s.place(40, 9), Some((41, 0)));
        assert_eq!(s.place(40, 9), Some((0, 10)));
        assert_eq!(s.place(40, 19), None);
        assert_eq!(s.place(10, 9), Some((82, 0)));
        s.clear();
        assert_eq!(s.place(99, 29), Some((0, 0)));
    }
}

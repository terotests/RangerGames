// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

/**
 * Even frames for the GL painter. A frame that takes longer than the
 * display's own (11 ms at 90 Hz) is shown one or two frames later, so a game
 * running at 40–60 fps on a 90 Hz screen alternates 11 and 22 ms between
 * pictures while the game moves by the time its frames took: the motion
 * judders. The pacer picks how many display frames a picture stays (the swap
 * interval, 1–3) from the frame times, with hysteresis, and gives the game
 * that many display frames as its step, so every picture moves alike: 45 or
 * 30 even frames a second rather than an uneven 40–50. A real stall (a file
 * loading) still goes to the game as the time it took.
 */
final class FramePacer {
    /** the display's frame, ms */
    private final double period;
    /** display frames a picture stays (the swap interval) */
    int interval = 1;
    /** the frames' mean time between pictures, ms */
    private double mean;
    /** the mean work a frame before its swap (the game and the painter's calls), ms */
    private double work;
    /** since when the frames have asked for a longer or a shorter interval, ms of frames */
    private double upFor, downFor;
    /** ms of frames since the last shorter interval, and how long shorter ones are not tried */
    private double sinceDown = 1e9, holdDown;

    FramePacer(float refreshHz) {
        period = 1000.0 / (refreshHz > 20 && refreshHz < 250 ? refreshHz : 60.0);
        mean = period;
    }

    /** the last frame's work before its swap, ms */
    void worked(double ms) {
        work += (ms - work) * 0.08;
    }

    /**
     * The game's step for a frame that took `real` ms since the last one; it
     * may change `interval` (the caller sets the swap interval then).
     */
    double step(double real) {
        sinceDown += real;
        if (holdDown > 0) holdDown -= real;
        mean += (Math.min(real, 4 * period * interval) - mean) * 0.08;
        double slot = period * interval;
        if (interval < 3 && mean > slot * 1.12) {
            upFor += real;
            if (upFor > 400) {
                interval++;
                upFor = downFor = 0;
                // a shorter interval that did not hold: don't try again soon
                if (sinceDown < 3000) holdDown = 20000;
            }
        } else {
            upFor = 0;
        }
        // the swap waits out the interval, so the frame's own work tells
        // whether a shorter one would hold (the GPU's part shows only after)
        if (interval > 1 && holdDown <= 0 && work < period * (interval - 1) * 0.7) {
            downFor += real;
            if (downFor > 2500) {
                interval--;
                upFor = downFor = 0;
                sinceDown = 0;
            }
        } else {
            downFor = 0;
        }
        slot = period * interval;
        // a stall: the game hears the time it really took
        if (real > slot * 1.3) return Math.min(100, real);
        return slot;
    }
}

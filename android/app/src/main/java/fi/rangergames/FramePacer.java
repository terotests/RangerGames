// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

/**
 * Even frames for the GL painter. A frame that takes longer than the
 * display's own (11 ms at 90 Hz) is shown one or two frames later, so a game
 * running at 40–60 fps on a 90 Hz screen alternates 11 and 22 ms between
 * pictures while the game moves by the time its frames took: the motion
 * judders. The pacer picks how many display frames a picture stays (the swap
 * interval, 1–3) from the frame times, with hysteresis, so pictures come
 * evenly (45 or 30 a second rather than an uneven 40–50). The game's step
 * comes from the engine's frame clock (VsyncClock → Engine.frameAt: whole
 * display frames with the rest carried, rg_core::clock); {@link #step}'s own
 * rounding is only the fallback before the first vsync. Where the device has
 * EGL_ANDROID_presentation_time each picture is given its vsync
 * ({@link #present}) and the swap interval stays 1, which also works where the
 * driver ignores the swap interval (the tablet: 11 / 22 ms before); without it
 * a driver that ignores the interval keeps 1 (adb shell setprop
 * debug.rg.present 0 to compare).
 */
final class FramePacer {
    /** the display's frame, ms */
    private double period;
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
    /** the display does not keep a picture longer (the tablet's driver ignores
     *  the swap interval: 89 fps at "swap 2"): interval stays 1 */
    private boolean ignored;
    private double fastFor;
    /** the pictures are given their vsync (presentation time): the swap interval stays 1 and the pacer keeps the interval itself */
    boolean paced;
    /** the last picture's vsync (ns), 0 before the first */
    private long lastPresent;

    FramePacer(float refreshHz) {
        period = 1000.0 / (refreshHz > 20 && refreshHz < 250 ? refreshHz : 60.0);
        mean = period;
    }

    /** The display's frame now (ms): it follows a change of the display's mode. */
    void period(double ms) {
        if (ms > 3 && ms < 60 && Math.abs(ms - period) > 0.3) {
            period = ms;
            mean = ms * interval;
            upFor = downFor = 0;
        }
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
        // pictures coming faster than the interval: the swap interval is not
        // kept, so a longer one only made the game run fast; back to 1 for good
        if (!paced && interval > 1 && mean < period * interval * 0.75) {
            fastFor += real;
            if (fastFor > 600) ignored = true;
        } else {
            fastFor = 0;
        }
        if (ignored && !paced) interval = 1;
        // the game's step: whole display frames, as the pictures are shown
        // (never more than the time that passed, rounded to the nearest frame)
        double frames = Math.max(1, Math.round(real / period));
        return Math.min(100, frames * period);
    }

    /**
     * The vsync this frame's picture is shown at (ns): `interval` display frames
     * after the last one, so 40–50 fps on a 90 Hz screen become an even 45
     * instead of 11 / 22 ms between pictures. A frame that is late goes to the
     * first vsync after its own. The engine steps the game to this time, so the
     * motion moves by exactly the time between the pictures shown.
     */
    long present(long vsyncNs, long periodNs) {
        long slot = periodNs * interval;
        long earliest = vsyncNs + periodNs;
        long t = lastPresent + slot;
        if (lastPresent == 0 || t < earliest || t > earliest + 4 * slot) t = earliest;
        lastPresent = t;
        return t;
    }

    /** How long to wait before this frame (ns) so that it is not made more than one picture ahead. */
    long ahead(long present, long now, long periodNs) {
        long w = present - now - periodNs * interval - periodNs;
        return w > 1_000_000L ? w : 0;
    }
}

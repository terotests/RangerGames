// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

/**
 * The GPU globes' resolution lowered while the GPU cannot keep up. Close over
 * the ground a globe fills the screen and every pixel runs the whole ground
 * shader: on the test tablet (Mali-G57 MC2) the Apollo 11 ascent ran at 6–7 fps
 * with the game's own work ~22 ms a frame, and debug.rg.glres 0.5 gave 18 fps.
 * GPU-bound shows as pictures coming much slower than the frame's work before
 * its swap (the swap waits for the GPU). While that holds and a big globe is
 * drawn, the resolution steps down (×0.8, to 0.5); a small globe or none puts
 * it back at once, and after a while at a lower step one step up is tried
 * again (and held back for a minute if it was too slow).
 */
final class GlAutoRes {
    static final float MIN = 0.5f, STEP = 0.8f;
    /** the factor for the globes' resolution, MIN..1 */
    float k = 1;
    private double real = 16, work = 16;
    private double slowFor, okFor, smallFor, holdUp;
    private boolean tried;
    /** the biggest globe picture this frame, pixels at the resolution before this factor */
    float framePx;

    /**
     * A frame's end: realMs since the last picture, workMs before its swap,
     * slotMs the swap interval's time; big: a big globe was drawn. True when
     * k changed.
     */
    boolean frame(double realMs, double workMs, double slotMs, boolean big) {
        realMs = Math.min(realMs, 400);
        real += (realMs - real) * 0.1;
        work += (workMs - work) * 0.1;
        if (holdUp > 0) holdUp -= realMs;
        if (!big) {
            smallFor += realMs;
            slowFor = okFor = 0;
            if (smallFor > 1000 && k < 1) {
                k = 1;
                tried = false;
                return true;
            }
            return false;
        }
        smallFor = 0;
        boolean gpuBound = real > 45 && real > work * 1.5 && real > slotMs * 1.25;
        if (gpuBound) {
            okFor = 0;
            slowFor += realMs;
            if (slowFor > 700 && k > MIN) {
                // a step up that did not hold: no new try for a minute
                if (tried) holdUp = 60000;
                tried = false;
                k = Math.max(MIN, k * STEP);
                slowFor = 0;
                real = work = Math.min(real, 45);
                return true;
            }
        } else {
            slowFor = 0;
            okFor += realMs;
            if (k < 1 && okFor > 15000 && holdUp <= 0) {
                k = Math.min(1, k / STEP);
                if (k > 0.98f) k = 1;
                tried = true;
                okFor = 0;
                return true;
            }
            if (okFor > 3000) tried = false;
        }
        return false;
    }
}

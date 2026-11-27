// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

import android.view.Choreographer;

/**
 * The display's vsync times for the game thread: Choreographer's frame time,
 * taken on the main thread, and the display's period. The game thread asks
 * for the vsync its frame belongs to: the time now put on the vsync grid
 * (the last vsync plus whole periods, the nearest one), so a frame that
 * starts just after a vsync whose callback has not run yet on the busy main
 * thread still gets that vsync's time. The engine turns these into steps of
 * whole display frames with the rest carried (rg_core::clock), so the game
 * moves as the pictures are shown and never drifts from the music.
 */
final class VsyncClock implements Choreographer.FrameCallback {
    /** the last vsync (System.nanoTime's clock, as Choreographer's), 0 before the first */
    private volatile long last;
    private volatile boolean on;
    /** the display's frame, ns: followed from the display, whose mode the system may change */
    volatile long periodNs;
    private final android.view.Display display;
    private long checkedAt;

    VsyncClock(android.view.Display d) {
        display = d;
        periodNs = periodOf(d);
    }

    private static long periodOf(android.view.Display d) {
        float hz = d != null ? d.getRefreshRate() : 60f;
        if (!(hz > 20 && hz < 250)) hz = 60f;
        return (long) (1e9 / hz);
    }

    /** On the main thread: start (again) taking the vsyncs. */
    void start() {
        if (on) return;
        on = true;
        Choreographer.getInstance().postFrameCallback(this);
    }

    /** On the main thread: stop (the app in the background). */
    void stop() {
        on = false;
        Choreographer.getInstance().removeFrameCallback(this);
    }

    @Override
    public void doFrame(long frameTimeNanos) {
        last = frameTimeNanos;
        // twice a second: the display's rate now (a mode change)
        if (frameTimeNanos - checkedAt > 500_000_000L) {
            checkedAt = frameTimeNanos;
            periodNs = periodOf(display);
        }
        if (on) Choreographer.getInstance().postFrameCallback(this);
    }

    /** The vsync time (ns) for a frame starting at `now` (System.nanoTime), or 0 when none is known. */
    long frameTime(long now) {
        long v = last;
        if (v == 0 || now - v > 250_000_000L || now < v - periodNs) return 0;
        long n = Math.round((now - v) / (double) periodNs);
        return v + n * periodNs;
    }

    double periodMs() {
        return periodNs / 1e6;
    }
}

// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

/**
 * The app in a VR headset (Meta Quest): the same games, drawn with OpenXR
 * (crates/rg_android/src/xr_android.rs) on a panel in a room, or around the
 * player when a game enters VR (rg.xr.enter("vr")). MainActivity starts this
 * one on a headset; see docs/vr.md.
 */
public class XrActivity extends MainActivity {
    @Override
    protected boolean xrMode() {
        return true;
    }
}

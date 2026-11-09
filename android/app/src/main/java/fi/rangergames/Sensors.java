// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Looper;
import android.view.Surface;

import org.json.JSONObject;

import java.util.Locale;
import java.util.Queue;

/**
 * The phone's sensors for the games (rg.sensor): GPS positions and the
 * compass heading, put on the game thread's input queue as {name, json}.
 * The GPS works without a network; only the satellites are needed. Asks
 * for the location permission the first time a game wants the position.
 */
final class Sensors implements LocationListener, SensorEventListener {
    static final int PERMISSION_REQUEST = 41;
    private final Activity activity;
    private final Queue<Object> out;
    private boolean wantLocation, wantHeading, locationOn, headingOn, paused, asked;
    private final float[] rot = new float[9];
    private final float[] orient = new float[3];
    private float lastDeg = -1000;
    private long lastHeadingAt;

    Sensors(Activity activity, Queue<Object> out) {
        this.activity = activity;
        this.out = out;
    }

    /** From the game thread: a sensor on or off ("*" = all). */
    void set(final String name, final boolean on) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (name.equals("location") || name.equals("*")) {
                    if (on && !wantLocation) asked = false;
                    wantLocation = on;
                }
                if (name.equals("heading") || name.equals("*")) wantHeading = on;
                apply();
            }
        });
    }

    void pause() {
        paused = true;
        apply();
    }

    void resume() {
        paused = false;
        apply();
    }

    /** The answer to the permission question. */
    void permissionResult(boolean granted) {
        if (!granted) send("error", "{\"sensor\":\"location\",\"reason\":\"permission\"}");
        apply();
    }

    private boolean hasPermission() {
        return Build.VERSION.SDK_INT < 23
                || activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void apply() {
        LocationManager lm = (LocationManager) activity.getSystemService(Context.LOCATION_SERVICE);
        boolean loc = wantLocation && !paused;
        if (loc && !locationOn && lm != null) {
            if (!hasPermission()) {
                if (Build.VERSION.SDK_INT >= 23 && !asked) {
                    // once a time the game asks: a "no" is not asked again on every resume
                    asked = true;
                    activity.requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, PERMISSION_REQUEST);
                }
            } else {
                try {
                    if (!lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                        send("error", "{\"sensor\":\"location\",\"reason\":\"gps-off\"}");
                    }
                    lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0, this, Looper.getMainLooper());
                    locationOn = true;
                    Location last = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                    if (last != null && System.currentTimeMillis() - last.getTime() < 120000) onLocationChanged(last);
                } catch (SecurityException | IllegalArgumentException e) {
                    send("error", "{\"sensor\":\"location\",\"reason\":\"unavailable\"}");
                }
            }
        } else if (!loc && locationOn && lm != null) {
            lm.removeUpdates(this);
            locationOn = false;
        }
        SensorManager sm = (SensorManager) activity.getSystemService(Context.SENSOR_SERVICE);
        boolean head = wantHeading && !paused;
        if (head && !headingOn && sm != null) {
            Sensor s = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
            if (s == null) {
                send("error", "{\"sensor\":\"heading\",\"reason\":\"unavailable\"}");
            } else {
                sm.registerListener(this, s, SensorManager.SENSOR_DELAY_UI);
                headingOn = true;
            }
        } else if (!head && headingOn && sm != null) {
            sm.unregisterListener(this);
            headingOn = false;
        }
    }

    private void send(String name, String json) {
        out.add(new String[]{name, json});
    }

    @Override
    public void onLocationChanged(Location l) {
        try {
            JSONObject o = new JSONObject();
            o.put("lat", l.getLatitude());
            o.put("lon", l.getLongitude());
            o.put("accuracy", l.hasAccuracy() ? l.getAccuracy() : 50);
            o.put("speed", l.hasSpeed() ? l.getSpeed() : -1);
            o.put("bearing", l.hasBearing() ? l.getBearing() : -1);
            o.put("altitude", l.hasAltitude() ? l.getAltitude() : 0);
            o.put("time", l.getTime());
            send("location", o.toString());
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {
    }

    @Override
    public void onProviderEnabled(String provider) {
    }

    @Override
    public void onProviderDisabled(String provider) {
        send("error", "{\"sensor\":\"location\",\"reason\":\"gps-off\"}");
    }

    @Override
    public void onSensorChanged(SensorEvent e) {
        SensorManager.getRotationMatrixFromVector(rot, e.values);
        float[] r = rot;
        int turn = activity.getWindowManager().getDefaultDisplay().getRotation();
        if (turn != Surface.ROTATION_0) {
            float[] o = new float[9];
            int ax = SensorManager.AXIS_Y, ay = SensorManager.AXIS_MINUS_X;
            if (turn == Surface.ROTATION_180) { ax = SensorManager.AXIS_MINUS_X; ay = SensorManager.AXIS_MINUS_Y; }
            else if (turn == Surface.ROTATION_270) { ax = SensorManager.AXIS_MINUS_Y; ay = SensorManager.AXIS_X; }
            SensorManager.remapCoordinateSystem(rot, ax, ay, o);
            r = o;
        }
        SensorManager.getOrientation(r, orient);
        float deg = (float) Math.toDegrees(orient[0]);
        if (deg < 0) deg += 360;
        long now = System.currentTimeMillis();
        float diff = Math.abs(deg - lastDeg);
        if (diff > 180) diff = 360 - diff;
        if (diff < 1.5f || now - lastHeadingAt < 80) return;
        lastDeg = deg;
        lastHeadingAt = now;
        send("heading", String.format(Locale.US, "{\"deg\":%.1f}", deg));
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
    }
}

// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothClass;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothServerSocket;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * rg.net over Bluetooth: phones play together without a network or a SIM.
 * One phone hosts (an RFCOMM server socket, made visible to the others for
 * two minutes), the others find it (the paired phones at once, nearby ones
 * by discovery) and connect. Up to 7 guests. The links carry lines of UTF-8
 * text, one message a line. Events go on the game thread's input queue as
 * {"net", json}, the same events the web host's BroadcastChannel gives
 * (web/js/net.js): info, state, peers, open, leave, data.
 *
 * Insecure RFCOMM is tried first so that two phones that were never paired
 * connect without a pairing dialog where the phones allow it; a secure
 * socket (which pairs) is the fallback.
 */
final class Bluetooth {
    static final int REQ_PERM = 43;
    static final int REQ_ENABLE = 44;
    static final int REQ_VISIBLE = 45;
    private static final String TAG = "RangerGames";
    private static final UUID SERVICE = UUID.fromString("6d2b3f0e-9a51-4c1e-8f0a-52616e676572");
    private static final String SERVICE_NAME = "RangerGames";

    private final Activity activity;
    private final Queue<Object> out;
    private final BluetoothAdapter adapter;
    private final ExecutorService writer = Executors.newSingleThreadExecutor();
    private final Map<String, Link> links = new LinkedHashMap<>();
    private final Map<String, JSONObject> found = new LinkedHashMap<>();
    private BluetoothServerSocket server;
    private String mode = "off";
    private int max = 7;
    private boolean hosting;
    /** what waits for a permission or for Bluetooth to be switched on */
    private String pending;
    private String pendingId;
    private boolean receiverOn;

    private final class Link {
        final String id;
        final String name;
        final BluetoothSocket socket;
        final OutputStream os;

        Link(BluetoothSocket s) throws IOException {
            socket = s;
            BluetoothDevice d = s.getRemoteDevice();
            id = d.getAddress();
            name = deviceName(d);
            os = s.getOutputStream();
        }
    }

    Bluetooth(Activity activity, Queue<Object> out) {
        this.activity = activity;
        this.out = out;
        BluetoothAdapter a = null;
        try {
            a = BluetoothAdapter.getDefaultAdapter();
        } catch (Exception ignored) {
        }
        adapter = a;
    }

    // ---- events to the game ----

    private void emit(JSONObject o) {
        out.add(new String[]{"net", o.toString()});
    }

    private void state(String s, String reason) {
        synchronized (this) {
            mode = s;
        }
        try {
            JSONObject o = new JSONObject().put("type", "state").put("state", s);
            if (reason != null) o.put("reason", reason);
            emit(o);
        } catch (Exception ignored) {
        }
    }

    private void peerEvent(String type, String id, String name) {
        try {
            emit(new JSONObject().put("type", type).put("peer", new JSONObject().put("id", id).put("name", name)));
        } catch (Exception ignored) {
        }
    }

    private String myName() {
        try {
            if (adapter != null && hasConnect()) {
                String n = adapter.getName();
                if (n != null) return n;
            }
        } catch (Exception ignored) {
        }
        return Build.MODEL;
    }

    private String deviceName(BluetoothDevice d) {
        String n = null;
        try {
            n = d.getName();
        } catch (SecurityException ignored) {
        }
        return n != null && !n.isEmpty() ? n : d.getAddress();
    }

    // ---- commands from the game thread ----

    void command(final String op, final JSONObject a) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    handle(op, a);
                } catch (Exception e) {
                    Log.w(TAG, "net " + op, e);
                    state("error", "unavailable");
                }
            }
        });
    }

    private void handle(String op, JSONObject a) {
        if (op.equals("close")) {
            close(false);
            try {
                emit(new JSONObject().put("type", "info").put("available", adapter != null).put("kind", "bluetooth").put("name", myName()));
            } catch (Exception ignored) {
            }
            return;
        }
        if (op.equals("send")) {
            send(a != null ? a.optString("to", "") : "", a != null ? a.optString("text", "") : "");
            return;
        }
        if (adapter == null) {
            state("error", "no-bluetooth");
            return;
        }
        if (op.equals("host")) {
            max = Math.max(1, Math.min(7, a != null ? a.optInt("max", 7) : 7));
            if (ready("host", null)) host();
        } else if (op.equals("find")) {
            if (ready("find", null)) find();
        } else if (op.equals("join")) {
            String id = a != null ? a.optString("id", "") : "";
            if (ready("join", id)) join(id);
        }
    }

    // ---- permissions and switching Bluetooth on ----

    private boolean granted(String p) {
        return Build.VERSION.SDK_INT < 23 || activity.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasConnect() {
        return Build.VERSION.SDK_INT < 31 || granted("android.permission.BLUETOOTH_CONNECT");
    }

    /** The runtime permissions `op` needs that are not granted yet. */
    private String[] missing(String op) {
        List<String> m = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 31) {
            if (!granted("android.permission.BLUETOOTH_CONNECT")) m.add("android.permission.BLUETOOTH_CONNECT");
            if (op.equals("find") && !granted("android.permission.BLUETOOTH_SCAN")) m.add("android.permission.BLUETOOTH_SCAN");
            if (op.equals("host") && !granted("android.permission.BLUETOOTH_ADVERTISE")) m.add("android.permission.BLUETOOTH_ADVERTISE");
        } else if (op.equals("find") && Build.VERSION.SDK_INT >= 23) {
            // Android 6–11 finds nearby devices only with the location permission
            if (!granted(Manifest.permission.ACCESS_FINE_LOCATION)) m.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        return m.toArray(new String[0]);
    }

    /** Whether `op` can run now; otherwise asks for what it needs and runs it after. */
    private boolean ready(String op, String id) {
        String[] need = missing(op);
        if (need.length > 0) {
            pending = op;
            pendingId = id;
            activity.requestPermissions(need, REQ_PERM);
            return false;
        }
        if (!adapter.isEnabled()) {
            pending = op;
            pendingId = id;
            try {
                // the host is asked to be visible, which switches Bluetooth on as well
                activity.startActivityForResult(new Intent(op.equals("host")
                        ? BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE
                        : BluetoothAdapter.ACTION_REQUEST_ENABLE), op.equals("host") ? REQ_VISIBLE : REQ_ENABLE);
            } catch (Exception e) {
                pending = null;
                state("error", "bluetooth-off");
            }
            return false;
        }
        return true;
    }

    void permissionResult(boolean ok) {
        String op = pending;
        pending = null;
        if (op == null) return;
        if (!ok) {
            state("error", "permission");
            return;
        }
        if (ready(op, pendingId)) run(op, pendingId);
    }

    /** The answer to "switch Bluetooth on" or "be visible" (resultCode: seconds visible, or 0). */
    void activityResult(int code, int result) {
        String op = pending;
        if (code == REQ_VISIBLE) {
            pending = null;
            if (result == Activity.RESULT_CANCELED) {
                if (adapter.isEnabled()) host(); else state("error", "bluetooth-off");
                return;
            }
            if (op != null) waitForOn(op, pendingId, 0);
            return;
        }
        pending = null;
        if (op == null) return;
        if (result != Activity.RESULT_OK) {
            state("error", "bluetooth-off");
            return;
        }
        waitForOn(op, pendingId, 0);
    }

    /** Bluetooth takes a moment to come on after the user says yes. */
    private void waitForOn(final String op, final String id, final int tries) {
        if (adapter.isEnabled()) {
            if (op.equals("host")) host(); else run(op, id);
            return;
        }
        if (tries > 30) {
            state("error", "bluetooth-off");
            return;
        }
        activity.getWindow().getDecorView().postDelayed(new Runnable() {
            @Override
            public void run() {
                waitForOn(op, id, tries + 1);
            }
        }, 200);
    }

    private void run(String op, String id) {
        if (op.equals("host")) host();
        else if (op.equals("find")) find();
        else if (op.equals("join")) join(id);
    }

    // ---- hosting ----

    /** Visible for two minutes to phones that were never paired with this one. */
    private void visible() {
        try {
            if (adapter.getScanMode() == BluetoothAdapter.SCAN_MODE_CONNECTABLE_DISCOVERABLE) return;
            Intent i = new Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE);
            i.putExtra(BluetoothAdapter.EXTRA_DISCOVERABLE_DURATION, 120);
            activity.startActivityForResult(i, REQ_VISIBLE + 100);
        } catch (Exception ignored) {
        }
    }

    private void host() {
        close(true);
        hosting = true;
        final BluetoothServerSocket s;
        try {
            BluetoothServerSocket ss;
            try {
                ss = adapter.listenUsingInsecureRfcommWithServiceRecord(SERVICE_NAME, SERVICE);
            } catch (IOException e) {
                ss = adapter.listenUsingRfcommWithServiceRecord(SERVICE_NAME, SERVICE);
            }
            s = ss;
        } catch (IOException | SecurityException e) {
            Log.w(TAG, "listen", e);
            state("error", "unavailable");
            return;
        }
        synchronized (this) {
            server = s;
        }
        state("hosting", null);
        if (pending == null) visible();
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                while (true) {
                    BluetoothSocket c;
                    try {
                        c = s.accept();
                    } catch (IOException e) {
                        return; // closed
                    }
                    boolean full;
                    synchronized (Bluetooth.this) {
                        full = server != s || links.size() >= max;
                    }
                    if (full) {
                        try {
                            c.close();
                        } catch (IOException ignored) {
                        }
                        continue;
                    }
                    opened(c);
                }
            }
        }, "rg-bt-accept");
        t.setDaemon(true);
        t.start();
    }

    // ---- finding and joining ----

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            String act = i.getAction();
            if (BluetoothDevice.ACTION_FOUND.equals(act)) {
                BluetoothDevice d = i.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                if (d == null) return;
                BluetoothClass k = i.getParcelableExtra(BluetoothDevice.EXTRA_CLASS);
                // phones (and tablets/computers that report so); not headphones, cars or watches
                int major = k != null ? k.getMajorDeviceClass() : BluetoothClass.Device.Major.PHONE;
                if (major != BluetoothClass.Device.Major.PHONE && major != BluetoothClass.Device.Major.COMPUTER) return;
                add(d, false);
            } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(act)) {
                // keep looking while the game waits on the search screen
                synchronized (Bluetooth.this) {
                    if (!mode.equals("searching")) return;
                }
                try {
                    adapter.startDiscovery();
                } catch (SecurityException ignored) {
                }
            }
        }
    };

    private void add(BluetoothDevice d, boolean paired) {
        try {
            String id = d.getAddress();
            JSONObject p = found.get(id);
            if (p == null) {
                p = new JSONObject();
                found.put(id, p);
            }
            p.put("id", id).put("name", deviceName(d)).put("paired", paired || p.optBoolean("paired"));
            JSONArray list = new JSONArray();
            for (JSONObject o : found.values()) list.put(o);
            emit(new JSONObject().put("type", "peers").put("peers", list));
        } catch (Exception ignored) {
        }
    }

    private void find() {
        close(true);
        found.clear();
        state("searching", null);
        try {
            emit(new JSONObject().put("type", "peers").put("peers", new JSONArray()));
        } catch (Exception ignored) {
        }
        // the paired phones at once: no waiting and no location needed
        try {
            for (BluetoothDevice d : adapter.getBondedDevices()) {
                BluetoothClass k = d.getBluetoothClass();
                int major = k != null ? k.getMajorDeviceClass() : BluetoothClass.Device.Major.PHONE;
                if (major == BluetoothClass.Device.Major.PHONE || major == BluetoothClass.Device.Major.COMPUTER) add(d, true);
            }
        } catch (SecurityException ignored) {
        }
        if (!receiverOn) {
            IntentFilter f = new IntentFilter(BluetoothDevice.ACTION_FOUND);
            f.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
            activity.registerReceiver(receiver, f);
            receiverOn = true;
        }
        try {
            adapter.startDiscovery();
        } catch (SecurityException e) {
            Log.w(TAG, "discovery", e);
        }
    }

    private void join(final String id) {
        final BluetoothDevice d;
        try {
            d = adapter.getRemoteDevice(id);
        } catch (IllegalArgumentException e) {
            state("error", "connect-failed");
            return;
        }
        stopDiscovery();
        state("connecting", null);
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                BluetoothSocket s = connect(d, true);
                if (s == null) s = connect(d, false);
                if (s == null) {
                    state("error", "connect-failed");
                    return;
                }
                synchronized (Bluetooth.this) {
                    if (!mode.equals("connecting")) {
                        try {
                            s.close();
                        } catch (IOException ignored) {
                        }
                        return;
                    }
                }
                opened(s);
            }
        }, "rg-bt-join");
        t.setDaemon(true);
        t.start();
    }

    private BluetoothSocket connect(BluetoothDevice d, boolean insecure) {
        BluetoothSocket s = null;
        try {
            s = insecure ? d.createInsecureRfcommSocketToServiceRecord(SERVICE) : d.createRfcommSocketToServiceRecord(SERVICE);
            s.connect();
            return s;
        } catch (IOException | SecurityException e) {
            Log.i(TAG, "connect " + (insecure ? "insecure" : "secure") + ": " + e);
            if (s != null) {
                try {
                    s.close();
                } catch (IOException ignored) {
                }
            }
            return null;
        }
    }

    private void stopDiscovery() {
        try {
            if (adapter != null && adapter.isDiscovering()) adapter.cancelDiscovery();
        } catch (SecurityException ignored) {
        }
        if (receiverOn) {
            try {
                activity.unregisterReceiver(receiver);
            } catch (Exception ignored) {
            }
            receiverOn = false;
        }
    }

    // ---- the links ----

    /** A socket is up (accepted by the host or connected by a guest): read its lines. */
    private void opened(BluetoothSocket s) {
        final Link l;
        try {
            l = new Link(s);
        } catch (IOException e) {
            return;
        }
        boolean full;
        synchronized (this) {
            Link old = links.put(l.id, l);
            if (old != null) quietClose(old.socket);
            full = !hosting || links.size() >= max;
        }
        // a guest is connected; a host is when it is full
        if (full) state("connected", null);
        peerEvent("open", l.id, l.name);
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    BufferedReader r = new BufferedReader(new InputStreamReader(l.socket.getInputStream(), StandardCharsets.UTF_8));
                    String line;
                    while ((line = r.readLine()) != null) {
                        if (line.isEmpty()) continue;
                        emit(new JSONObject().put("type", "data").put("from", l.id).put("text", line));
                    }
                } catch (Exception ignored) {
                }
                dropped(l);
            }
        }, "rg-bt-read");
        t.setDaemon(true);
        t.start();
    }

    private void dropped(Link l) {
        boolean was, host;
        synchronized (this) {
            was = links.get(l.id) == l;
            if (was) links.remove(l.id);
            host = hosting;
        }
        quietClose(l.socket);
        if (!was) return;
        peerEvent("leave", l.id, l.name);
        String m;
        synchronized (this) {
            m = mode;
        }
        // a guest whose host left is alone again; a host waits for others again
        if (host) {
            if (m.equals("connected")) state("hosting", null);
        } else if (m.equals("connected")) state("off", null);
    }

    private void send(final String to, String text) {
        final byte[] b = (text.replace('\n', ' ') + "\n").getBytes(StandardCharsets.UTF_8);
        final List<Link> targets = new ArrayList<>();
        synchronized (this) {
            for (Link l : links.values()) if (to.isEmpty() || to.equals(l.id)) targets.add(l);
        }
        if (targets.isEmpty()) return;
        writer.execute(new Runnable() {
            @Override
            public void run() {
                for (Link l : targets) {
                    try {
                        l.os.write(b);
                        l.os.flush();
                    } catch (IOException e) {
                        dropped(l);
                    }
                }
            }
        });
    }

    private static void quietClose(BluetoothSocket s) {
        try {
            s.close();
        } catch (IOException ignored) {
        }
    }

    /** Everything off: the server, the links, the search. */
    void close(boolean quiet) {
        stopDiscovery();
        List<Link> all;
        BluetoothServerSocket s;
        String was;
        synchronized (this) {
            all = new ArrayList<>(links.values());
            links.clear();
            s = server;
            server = null;
            was = mode;
            hosting = false;
            mode = "off";
        }
        if (s != null) {
            try {
                s.close();
            } catch (IOException ignored) {
            }
        }
        for (Link l : all) quietClose(l.socket);
        if (!quiet && !was.equals("off")) state("off", null);
    }

    void destroy() {
        close(true);
        writer.shutdownNow();
    }
}

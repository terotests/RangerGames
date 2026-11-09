// SPDX-License-Identifier: AGPL-3.0-or-later
package fi.rangergames;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Queue;

/**
 * Photos for the games (rg.camera): the phone's own camera app takes the
 * picture into the photo folder (Pictures/Kotiin, so it is in the gallery),
 * and a small copy and a thumbnail go to the app's private files and into
 * the virtual directory as /save/photos/<id>.jpg and <id>_t.jpg. Then the
 * game gets onPhoto({ id, ok, path, thumb }). No network is used.
 */
final class Camera {
    static final int REQ_SHOT = 42;
    static final int REQ_PERM = 43;
    private static final String TAG = "RangerGames";
    private final Activity activity;
    private final Queue<Object> out;
    private String pendingId;
    private Uri pendingUri;

    Camera(Activity activity, Queue<Object> out) {
        this.activity = activity;
        this.out = out;
    }

    private File dir() {
        File d = new File(activity.getFilesDir(), "photos");
        if (!d.isDirectory()) d.mkdirs();
        return d;
    }

    /** The small copies kept from before: {vfs path, bytes} for the pack at start. */
    List<Object[]> stored() {
        List<Object[]> list = new ArrayList<>();
        File[] files = dir().listFiles();
        if (files == null) return list;
        for (File f : files) {
            try (FileInputStream in = new FileInputStream(f)) {
                byte[] b = new byte[(int) f.length()];
                int n = 0;
                while (n < b.length) {
                    int r = in.read(b, n, b.length - n);
                    if (r < 0) break;
                    n += r;
                }
                list.add(new Object[]{"/save/photos/" + f.getName(), b});
            } catch (Exception e) {
                Log.w(TAG, "photo " + f, e);
            }
        }
        return list;
    }

    /** From the game thread: forget a photo's copies (the gallery keeps the picture). */
    void delete(String id) {
        if (!safe(id)) return;
        new File(dir(), id + ".jpg").delete();
        new File(dir(), id + "_t.jpg").delete();
    }

    private static boolean safe(String id) {
        return id != null && id.matches("[A-Za-z0-9_-]{1,64}");
    }

    /** From the game thread: take a photo named id. */
    void take(final String id) {
        activity.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (!safe(id)) {
                    fail(id, "bad-id");
                    return;
                }
                pendingId = id;
                if (Build.VERSION.SDK_INT < 29 && activity.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                    activity.requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_PERM);
                    return;
                }
                launch();
            }
        });
    }

    void permissionResult(boolean granted) {
        if (pendingId == null) return;
        if (granted) launch();
        else fail(pendingId, "permission");
    }

    private void launch() {
        String id = pendingId;
        try {
            String name = "Kotiin_" + id + ".jpg";
            ContentValues v = new ContentValues();
            v.put(MediaStore.Images.Media.DISPLAY_NAME, name);
            v.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            if (Build.VERSION.SDK_INT >= 29) {
                v.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Kotiin");
            } else {
                File d = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "Kotiin");
                if (!d.isDirectory()) d.mkdirs();
                v.put(MediaStore.Images.Media.DATA, new File(d, name).getAbsolutePath());
            }
            pendingUri = activity.getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
            if (pendingUri == null) {
                fail(id, "storage");
                return;
            }
            Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            i.putExtra(MediaStore.EXTRA_OUTPUT, pendingUri);
            i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivityForResult(i, REQ_SHOT);
        } catch (ActivityNotFoundException e) {
            dropPending();
            fail(id, "no-camera");
        } catch (Exception e) {
            Log.w(TAG, "camera", e);
            dropPending();
            fail(id, "error");
        }
    }

    private void dropPending() {
        if (pendingUri != null) {
            try {
                activity.getContentResolver().delete(pendingUri, null, null);
            } catch (Exception ignored) {
            }
        }
        pendingUri = null;
    }

    /** The camera app's answer. */
    void result(int resultCode) {
        final String id = pendingId;
        final Uri uri = pendingUri;
        pendingId = null;
        pendingUri = null;
        if (id == null) return;
        if (resultCode != Activity.RESULT_OK || uri == null) {
            pendingUri = uri;
            dropPending();
            fail(id, "cancelled");
            return;
        }
        // decoding a camera picture takes a moment: off the UI thread
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    byte[] big = scaled(uri, 960, 82);
                    byte[] thumb = scaled(uri, 200, 80);
                    if (big == null || thumb == null) {
                        fail(id, "decode");
                        return;
                    }
                    write(new File(dir(), id + ".jpg"), big);
                    write(new File(dir(), id + "_t.jpg"), thumb);
                    String path = "/save/photos/" + id + ".jpg", tpath = "/save/photos/" + id + "_t.jpg";
                    out.add(new Object[]{path, big});
                    out.add(new Object[]{tpath, thumb});
                    JSONObject o = new JSONObject();
                    o.put("id", id);
                    o.put("ok", true);
                    o.put("path", path);
                    o.put("thumb", tpath);
                    BitmapFactory.Options bo = new BitmapFactory.Options();
                    bo.inJustDecodeBounds = true;
                    BitmapFactory.decodeByteArray(big, 0, big.length, bo);
                    o.put("w", bo.outWidth);
                    o.put("h", bo.outHeight);
                    out.add(new String[]{"photo", o.toString()});
                } catch (Exception e) {
                    Log.w(TAG, "photo", e);
                    fail(id, "error");
                }
            }
        }, "rg-photo").start();
    }

    private void fail(String id, String reason) {
        try {
            JSONObject o = new JSONObject();
            o.put("id", id == null ? "" : id);
            o.put("ok", false);
            o.put("reason", reason);
            out.add(new String[]{"photo", o.toString()});
        } catch (Exception ignored) {
        }
    }

    private static void write(File f, byte[] b) throws Exception {
        try (FileOutputStream o = new FileOutputStream(f)) {
            o.write(b);
        }
    }

    /** The picture at most `max` px on its long side, upright, as JPEG. */
    private byte[] scaled(Uri uri, int max, int quality) throws Exception {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        try (InputStream in = activity.getContentResolver().openInputStream(uri)) {
            BitmapFactory.decodeStream(in, null, o);
        }
        if (o.outWidth <= 0) return null;
        int sample = 1;
        while (Math.max(o.outWidth, o.outHeight) / (sample * 2) >= max) sample *= 2;
        BitmapFactory.Options d = new BitmapFactory.Options();
        d.inSampleSize = sample;
        Bitmap b;
        try (InputStream in = activity.getContentResolver().openInputStream(uri)) {
            b = BitmapFactory.decodeStream(in, null, d);
        }
        if (b == null) return null;
        int turn = 0;
        try (InputStream in = activity.getContentResolver().openInputStream(uri)) {
            int ori = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            if (ori == ExifInterface.ORIENTATION_ROTATE_90) turn = 90;
            else if (ori == ExifInterface.ORIENTATION_ROTATE_180) turn = 180;
            else if (ori == ExifInterface.ORIENTATION_ROTATE_270) turn = 270;
        } catch (Exception ignored) {
        }
        float k = Math.min(1f, (float) max / Math.max(b.getWidth(), b.getHeight()));
        Matrix m = new Matrix();
        m.postScale(k, k);
        if (turn != 0) m.postRotate(turn);
        Bitmap s = Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true);
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        s.compress(Bitmap.CompressFormat.JPEG, quality, bo);
        if (s != b) s.recycle();
        b.recycle();
        return bo.toByteArray();
    }
}

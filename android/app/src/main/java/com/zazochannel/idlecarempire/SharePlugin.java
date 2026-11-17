package com.zazochannel.idlecarempire;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;

/**
 * The phone's own share sheet for a picture or a clip the game made (src/lib/share-card.ts): the
 * WebView has no navigator.share and no downloads, so the file is written to the app's cache (the
 * only folder its FileProvider hands out, res/xml/file_paths.xml) and sent with ACTION_SEND.
 * Earlier shared files are deleted first, so the cache never holds more than the last one.
 */
@CapacitorPlugin(name = "GameShare")
public class SharePlugin extends Plugin {

    private static final long MAX_BYTES = 40L * 1024 * 1024;

    @PluginMethod
    public void shareFile(PluginCall call) {
        Activity activity = getActivity();
        String data = call.getString("data");
        String mime = call.getString("mime", "application/octet-stream");
        String name = call.getString("name", "share").replaceAll("[^A-Za-z0-9._-]", "_");
        String text = call.getString("text");
        if (activity == null || data == null || data.isEmpty()) {
            call.reject("nothing to share");
            return;
        }
        if (!mime.matches("^(image/png|image/jpeg|video/mp4|video/webm)$")) {
            call.reject("unsupported type");
            return;
        }
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            if (bytes.length > MAX_BYTES) {
                call.reject("too large");
                return;
            }
            File dir = new File(getContext().getCacheDir(), "share");
            if (dir.isDirectory()) {
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
            } else if (!dir.mkdirs()) {
                call.reject("no cache");
                return;
            }
            File file = new File(dir, name.isEmpty() ? "share" : name);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(bytes);
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            if (text != null && !text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
            send.setClipData(ClipData.newRawUri(name, uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, null);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(chooser);
            JSObject r = new JSObject();
            r.put("shared", true);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("share failed", e);
        }
    }
}

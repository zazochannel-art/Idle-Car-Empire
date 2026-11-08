"""FFmpeg encode: pipe raw RGB frames from the Timeline + the mixed audio into an H.264/AAC MP4."""
import subprocess


def ffmpeg_command(out_path, audio_path, d, W, H, fps, duration, title="", comment=""):
    vf = "scale=out_color_matrix=bt709:out_range=tv,format=" + d["pix_fmt"]
    cmd = ["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps),
           "-i", "-", "-i", str(audio_path),
           "-map", "0:v:0", "-map", "1:a:0",
           "-vf", vf,
           "-c:v", d["video_codec"], "-preset", d["preset"], "-crf", str(d["crf"]),
           "-profile:v", d["profile"], "-level", "4.2", "-pix_fmt", d["pix_fmt"],
           "-maxrate", d["maxrate"], "-bufsize", d["bufsize"], "-g", str(d["gop"]), "-bf", "2",
           "-r", str(fps), "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
           "-c:a", d["audio_codec"], "-b:a", d["audio_bitrate"], "-ar", str(d["audio_rate"]),
           "-ac", str(d["audio_channels"]),
           "-t", f"{duration:.3f}", "-movflags", "+faststart",
           "-metadata", f"title={title}", "-metadata", f"comment={comment}",
           str(out_path)]
    return cmd


def encode(tl, audio_path, out_path, d, title="", comment="", progress=None):
    cmd = ffmpeg_command(out_path, audio_path, d, tl.W, tl.H, tl.fps, tl.duration, title, comment)
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        for f in range(tl.frames):
            p.stdin.write(tl.render_frame(f).tobytes())
            if progress and f % 90 == 0:
                progress(f, tl.frames)
        p.stdin.close()
    except BrokenPipeError:
        pass
    err = p.stderr.read().decode(errors="replace")
    rc = p.wait()
    tl.close()
    if rc != 0:
        raise RuntimeError(f"ffmpeg failed (rc={rc}): {err[-800:]}")
    return cmd

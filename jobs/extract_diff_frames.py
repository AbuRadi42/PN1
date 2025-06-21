#!/usr/bin/env python3
import argparse
import os
import re
import shutil
import subprocess
import sys

def extract_diff_frames_ffmpeg(video_path, output_dir, threshold, ffmpeg_path):
    """
    Uses `ffmpeg -vf select=gt(scene,threshold)` to extract frames
    that differ by at least `threshold` (0.0–1.0). Filenames include the timestamp.
    """
    os.makedirs(output_dir, exist_ok=True)

    # Clamp & format threshold
    scene_thresh = max(0.0, min(threshold, 1.0))

    # Build the ffmpeg command
    cmd = [
        ffmpeg_path,
        "-i", video_path,
        "-vf", f"select=gt(scene\\,{scene_thresh:.3f}),showinfo",
        "-vsync", "vfr",
        os.path.join(output_dir, "frame_%06d.jpg")
    ]

    # Run ffmpeg; capture stderr for showinfo logs
    proc = subprocess.run(
        cmd,
        stderr=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        text=True
    )

    log_lines = proc.stderr.splitlines()
    ts_pattern = re.compile(r"pts_time:(\d+\.\d+)")
    timestamps = [float(m.group(1)) for line in log_lines if (m := ts_pattern.search(line))]

    # Rename output files to include timestamp
    for idx, ts in enumerate(timestamps, start=1):
        old = os.path.join(output_dir, f"frame_{idx:06d}.jpg")
        new = os.path.join(output_dir, f"frame_{ts:.2f}.jpg")
        if os.path.exists(old):
            os.rename(old, new)

    print(f"Processed frames (threshold={scene_thresh:.3f}); saved {len(timestamps)} frames to {output_dir}")

def main():
    parser = argparse.ArgumentParser(
        description="Extract scene‑change frames via FFmpeg, naming them by timestamp."
    )
    parser.add_argument("video_path", help="Path to the video file")
    parser.add_argument("output_dir", help="Directory to save extracted frames")
    parser.add_argument(
        "--threshold", type=float, default=0.10,
        help="Scene‑change threshold (0.0–1.0; default 0.10)"
    )
    parser.add_argument(
        "--ffmpeg-path",
        default=os.path.join(os.getcwd(), "bin", "ffmpeg"),
        help="Path to ffmpeg binary (default: ./bin/ffmpeg)"
    )
    args = parser.parse_args()

    # Verify binary exists
    if not shutil.which(args.ffmpeg_path):
        print(f"Error: ffmpeg not found at {args.ffmpeg_path}", file=sys.stderr)
        sys.exit(1)

    extract_diff_frames_ffmpeg(
        args.video_path,
        args.output_dir,
        args.threshold,
        args.ffmpeg_path
    )

if __name__ == "__main__":
    main()

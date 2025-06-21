import argparse
import os
import cv2
import numpy as np

def extract_diff_frames(video_path, output_dir, threshold):
    """
    Captures frames from a video only if they differ enough
    from the last captured frame. Filenames now include the time in seconds.
    """
    cap = cv2.VideoCapture(video_path)
    os.makedirs(output_dir, exist_ok=True)

    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_index = 0
    saved_count = 0
    last_gray = None

    while True:
        ret, frame = cap.read()
        if not ret:
            break  # No more frames

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        current_time_sec = frame_index / fps if fps else 0.0

        # If first capture or difference >= threshold, we save the frame
        if last_gray is None:
            last_gray = gray.copy()
            out_name = f"frame_{current_time_sec:.2f}.jpg"
            out_path = os.path.join(output_dir, out_name)
            cv2.imwrite(out_path, gray)
            saved_count += 1
        else:
            diff = cv2.absdiff(gray, last_gray)
            score = np.mean(diff)

            if score >= threshold:
                last_gray = gray.copy()
                out_name = f"frame_{current_time_sec:.2f}.jpg"
                out_path = os.path.join(output_dir, out_name)
                cv2.imwrite(out_path, gray)
                saved_count += 1

        frame_index += 1

    cap.release()
    total_frames = frame_index
    print(f"Processed {int(total_frames)} frames; saved {saved_count} frames.")
    print(f"Frames are in: {output_dir}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Extract frames from a video with difference-based capture, storing time in filename."
    )
    parser.add_argument("video_path", help="Path to the video file")
    parser.add_argument("output_dir", help="Directory to save extracted frames")
    parser.add_argument(
        "--threshold", type=float, default=30.0, help="Difference threshold"
    )
    args = parser.parse_args()

    extract_diff_frames(args.video_path, args.output_dir, args.threshold)

import argparse
import os
import json
import cv2
import numpy as np
import time
from tqdm import tqdm

# Must match the 5-class model output
EMOTIONS = ["Angry", "Happy", "Relaxed", "Sad", "Neutral"]

class PlaceholderModel:
    def predict(self, input_data):
        # Return dummy predictions
        return [np.random.rand(len(EMOTIONS))]  # Random predictions for each class

def preprocess_frame(gray, debug=False):
    """
    Resize to (192x192), normalize, add batch and channel dims.
    """
    if debug:
        print("Original shape:", gray.shape)
    gray = cv2.resize(gray, (192, 192))
    gray = gray / 255.0
    gray = np.expand_dims(gray, axis=(0, -1))  # -> (1,192,192,1)
    if debug:
        print("Preprocessed shape:", gray.shape)
    return gray

def analyze_extracted_frames(frames_dir, model_path, output_json, debug=False):
    # Use a placeholder model instead of loading a TensorFlow model
    model = PlaceholderModel()
    results = []

    frame_files = sorted(
        [f for f in os.listdir(frames_dir) if f.endswith(".jpg")],
        key=lambda x: float(os.path.splitext(x)[0].split("_")[1]),
    )

    start_time = time.time()

    for fname in tqdm(frame_files, desc="Analyzing frames"):
        frame_path = os.path.join(frames_dir, fname)
        try:
            timestamp = float(os.path.splitext(fname)[0].split("_")[1])
            img_gray = cv2.imread(frame_path, cv2.IMREAD_GRAYSCALE)

            if img_gray is None:
                if debug:
                    print(f"⚠️ Could not read: {frame_path}")
                continue

            preprocessed = preprocess_frame(img_gray, debug=debug)
            preds = np.squeeze(model.predict(preprocessed))

            result = {EMOTIONS[i]: float(preds[i]) for i in range(min(len(preds), len(EMOTIONS)))}
            result["time"] = round(timestamp, 2)
            results.append(result)

        except Exception as e:
            print(f"❌ Error processing {fname}: {e}")
            continue

    with open(output_json, "w") as f:
        json.dump(results, f, indent=2)

    duration = time.time() - start_time
    print(f"\n✅ Analysis complete. {len(results)} frames processed in {duration:.2f}s")
    print(f"📁 Results saved to: {output_json}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Analyze frames using a 5-class grayscale model.")
    parser.add_argument("frames_dir", help="Directory of frames")
    parser.add_argument("model_path", help="Path to .h5 or .keras model")
    parser.add_argument("output_json", help="Where to save analysis JSON")
    parser.add_argument("--debug", action="store_true", help="Enable verbose logging")
    args = parser.parse_args()

    analyze_extracted_frames(args.frames_dir, args.model_path, args.output_json, debug=args.debug)

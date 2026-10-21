#!/usr/bin/env python3
"""
depth_engine.py - Grayscale video depth map engine for omnimux-video

Open-source model: Depth Anything V2 Small (ONNX)
Source: https://huggingface.co/onnx-community/depth-anything-v2-small

Features:
  - ONNX Runtime with CoreML / CUDA / CPU provider selection
  - Lazy model download into $DSH_HOME/models/depth or ~/.dsh/models/depth
  - Near=white / far=black grayscale convention (invertible)
  - Optional side-by-side preview (original | depth)
  - JSON progress / complete events on stdout
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

import numpy as np

try:
    import cv2
except ImportError:
    print("[ERROR] OpenCV (cv2) is required. Install with `pip install opencv-python`.", file=sys.stderr)
    sys.exit(1)

try:
    import onnxruntime as ort
except ImportError:
    print("[ERROR] onnxruntime is required. Install with `pip install onnxruntime`.", file=sys.stderr)
    sys.exit(1)


IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(1, 1, 3)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(1, 1, 3)

MODEL_PRESETS = {
    # Fast: int8 quantized Small model, long edge 384. ~2x faster than float CPU
    # and ~5x faster than the old CoreML-first default (measured on Apple Silicon).
    "fast": {
        "filename": "depth_anything_v2_small_int8.onnx",
        "urls": [
            "https://hf-mirror.com/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx",
            "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx",
        ],
        "max_edge": 384,
    },
    # Quality: original float32 model, long edge 518.
    "quality": {
        "filename": "depth_anything_v2_small.onnx",
        "urls": [
            "https://hf-mirror.com/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx",
            "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx",
        ],
        "max_edge": 518,
    },
}
MODEL_FILENAME = MODEL_PRESETS["quality"]["filename"]
MODEL_URLS = MODEL_PRESETS["quality"]["urls"]


def default_models_dir() -> Path:
    env_models = os.environ.get("DSH_VIDEO_MODELS_DIR")
    if isinstance(env_models, str) and env_models.strip():
        return Path(env_models).expanduser()
    dsh_home = os.environ.get("DSH_HOME")
    if isinstance(dsh_home, str) and dsh_home.strip():
        return Path(dsh_home).expanduser() / "models" / "depth"
    return Path.home() / ".dsh" / "models" / "depth"


def ensure_model(model_path: Path, urls: list[str] | None = None) -> Path:
    if model_path.exists() and model_path.stat().st_size > 1_000_000:
        return model_path
    model_path.parent.mkdir(parents=True, exist_ok=True)
    part = model_path.with_suffix(model_path.suffix + ".part")
    last_err = None
    for url in (urls or MODEL_URLS):
        try:
            print(f"[INFO] Downloading Depth Anything V2 Small ONNX from {url}", file=sys.stderr)

            def report(block, block_size, total):
                if block % 40 != 0:
                    return
                done = block * block_size
                pct = (done / total * 100.0) if total else 0.0
                print(f"\r[DOWNLOAD] {done}/{total} ({pct:.1f}%)", end="", file=sys.stderr, flush=True)

            urllib.request.urlretrieve(url, str(part), reporthook=report)
            print(file=sys.stderr)
            part.replace(model_path)
            print(f"[INFO] Model saved to {model_path} ({model_path.stat().st_size} bytes)", file=sys.stderr)
            return model_path
        except Exception as e:
            last_err = e
            print(f"[WARN] download failed: {type(e).__name__}: {e}", file=sys.stderr)
            try:
                if part.exists():
                    part.unlink()
            except Exception:
                pass
    raise RuntimeError(f"model download failed: {last_err}")


def pick_providers(prefer: str = "auto") -> list[str]:
    avail = ort.get_available_providers()
    order = {
        # CoreML only claims ~2/3 of this graph and loses time on cross-EP copies
        # (measured 3.7 fps vs 6.8 fps on CPU), so CPU is preferred over CoreML.
        "auto": ["CUDAExecutionProvider", "CPUExecutionProvider", "CoreMLExecutionProvider"],
        "coreml": ["CoreMLExecutionProvider", "CPUExecutionProvider"],
        "cuda": ["CUDAExecutionProvider", "CPUExecutionProvider"],
        "cpu": ["CPUExecutionProvider"],
    }.get(prefer, ["CPUExecutionProvider"])
    return [p for p in order if p in avail] or ["CPUExecutionProvider"]


def round_to_multiple(x: int, m: int = 14) -> int:
    return max(m, int(round(x / m) * m))


def preprocess(bgr: np.ndarray, max_edge: int) -> tuple[np.ndarray, tuple[int, int]]:
    h0, w0 = bgr.shape[:2]
    scale = 1.0
    if max_edge > 0:
        long_edge = max(h0, w0)
        if long_edge > max_edge:
            scale = max_edge / float(long_edge)
    nh = round_to_multiple(int(h0 * scale))
    nw = round_to_multiple(int(w0 * scale))
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    rgb = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_CUBIC)
    rgb = (rgb - IMAGENET_MEAN) / IMAGENET_STD
    chw = np.transpose(rgb, (2, 0, 1))[None, ...].astype(np.float32)
    return chw, (h0, w0)


def depth_to_gray(
    depth: np.ndarray,
    out_hw: tuple[int, int],
    invert: bool = False,
    percentile_clip: tuple[float, float] = (2.0, 98.0),
) -> np.ndarray:
    d = depth.astype(np.float32)
    lo, hi = np.percentile(d, percentile_clip)
    if hi <= lo:
        hi = lo + 1e-6
    d = np.clip((d - lo) / (hi - lo), 0.0, 1.0)
    if invert:
        d = 1.0 - d
    gray = (d * 255.0).astype(np.uint8)
    h0, w0 = out_hw
    if gray.shape[:2] != (h0, w0):
        gray = cv2.resize(gray, (w0, h0), interpolation=cv2.INTER_CUBIC)
    return gray


def side_by_side(bgr: np.ndarray, gray: np.ndarray) -> np.ndarray:
    depth_bgr = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    return np.concatenate([bgr, depth_bgr], axis=1)


def run(args: argparse.Namespace) -> dict:
    models_dir = Path(args.models_dir).expanduser() if args.models_dir else default_models_dir()
    preset_name = args.preset
    preset = MODEL_PRESETS[preset_name]
    model_path = Path(args.model).expanduser() if args.model else (models_dir / preset["filename"])
    model_path = ensure_model(model_path, preset["urls"])
    # -1 = use the preset default; 0 = native rounded; >0 = explicit long edge.
    max_edge = args.max_edge if args.max_edge >= 0 else preset["max_edge"]

    providers = pick_providers(args.provider)
    sess = ort.InferenceSession(str(model_path), providers=providers)
    input_name = sess.get_inputs()[0].name
    output_name = sess.get_outputs()[0].name
    used_providers = sess.get_providers()

    cap = cv2.VideoCapture(args.input)
    if not cap.isOpened():
        raise RuntimeError(f"cannot open video: {args.input}")

    fps_src = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    fps = float(args.fps) if args.fps and args.fps > 0 else fps_src
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    start_frame = int(max(0.0, args.start) * fps_src)
    if args.duration > 0:
        max_frames = int(args.duration * fps_src)
    else:
        max_frames = max(0, total - start_frame)
    if args.max_frames > 0:
        max_frames = min(max_frames, args.max_frames)

    if start_frame > 0:
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    out_w = width * 2 if args.side_by_side else width
    out_h = height

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(
        args.output,
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (out_w, out_h),
        True,
    )
    if not writer.isOpened():
        raise RuntimeError("failed to open VideoWriter")

    t0 = time.time()
    processed = 0
    try:
        while processed < max_frames:
            ok, frame = cap.read()
            if not ok:
                break
            tensor, hw = preprocess(frame, max_edge)
            pred = sess.run([output_name], {input_name: tensor})[0]
            depth = np.squeeze(pred[0])
            gray = depth_to_gray(depth, hw, invert=args.invert)
            out_frame = side_by_side(frame, gray) if args.side_by_side else cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
            writer.write(out_frame)
            processed += 1
            if processed == 1 or processed % 10 == 0 or processed == max_frames:
                elapsed = max(time.time() - t0, 1e-6)
                speed = processed / elapsed
                eta = (max_frames - processed) / speed if speed > 0 else 0
                print(json.dumps({
                    "type": "progress",
                    "frame": processed,
                    "totalFrames": max_frames,
                    "fps": round(speed, 2),
                    "etaSeconds": round(eta, 1),
                    "providers": used_providers,
                }), flush=True)
    finally:
        writer.release()
        cap.release()

    elapsed = time.time() - t0
    meta = {
        "type": "complete",
        "model": "Depth-Anything-V2-Small-ONNX",
        "source": "https://huggingface.co/onnx-community/depth-anything-v2-small",
        "input": args.input,
        "output": args.output,
        "modelPath": str(model_path),
        "providers": used_providers,
        "processedFrames": processed,
        "fps": fps,
        "width": out_w,
        "height": out_h,
        "durationSeconds": processed / fps if fps else 0,
        "elapsedSeconds": round(elapsed, 2),
        "speedFps": round(processed / max(elapsed, 1e-6), 2),
        "sideBySide": bool(args.side_by_side),
        "invert": bool(args.invert),
        "maxEdge": max_edge,
        "preset": preset_name,
        "modelFile": model_path.name,
        "convention": "near=white, far=black" if not args.invert else "near=black, far=white",
    }
    print(json.dumps(meta, ensure_ascii=False), flush=True)
    return meta


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="omnimux-video Depth Anything V2 grayscale depth engine")
    p.add_argument("--input", "-i", required=True, help="Input video path")
    p.add_argument("--output", "-o", required=True, help="Output mp4 path (video-only; audio muxed by host)")
    p.add_argument("--model", default="", help="Explicit ONNX model path")
    p.add_argument("--preset", default="fast", choices=["fast", "quality"],
                   help="fast=int8 + long-edge 384 (default); quality=float32 + 518")
    p.add_argument("--models-dir", default="", help="Model cache directory")
    p.add_argument("--provider", default="auto", choices=["auto", "coreml", "cuda", "cpu"])
    p.add_argument("--max-edge", type=int, default=-1,
                   help="Long-edge resize before inference (-1=preset default, 0=native rounded)")
    p.add_argument("--start", type=float, default=0.0, help="Start seconds")
    p.add_argument("--duration", type=float, default=0.0, help="Duration seconds (0=all)")
    p.add_argument("--max-frames", type=int, default=0, help="Hard frame cap (0=unlimited)")
    p.add_argument("--fps", type=float, default=0.0, help="Output FPS override (0=source)")
    p.add_argument("--side-by-side", action="store_true", help="Left original / right depth")
    p.add_argument("--invert", action="store_true", help="Invert depth polarity")
    return p


if __name__ == "__main__":
    ns = build_parser().parse_args()
    try:
        run(ns)
    except Exception as e:
        print(json.dumps({"type": "error", "error": str(e)}), file=sys.stderr)
        raise

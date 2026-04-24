"""
detector.py — Deepfake detection pipeline v4.0

Models:
  - vit+clip+mtcnn  (full pipeline, default)
  - vit             (ViT-base only, fastest)
  - clip            (CLIP only)
  - vit+mtcnn       (ViT + face analysis, no CLIP)

Heatmap: gradient-weighted attention map (GradCAM-style approximation using
         the patch token representations from the ViT's last hidden state).
"""

import os
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"

import cv2
import torch
import numpy as np
from PIL import Image
import torch.nn.functional as F
from transformers import AutoImageProcessor, AutoModelForImageClassification, CLIPProcessor, CLIPModel
from facenet_pytorch import MTCNN
from collections import Counter
import io
import base64

# =========================
# LOAD MODELS
# =========================
print("Loading models...")

MODEL_NAME = "Ateeqq/ai-vs-human-image-detector"

processor   = AutoImageProcessor.from_pretrained(MODEL_NAME)
model       = AutoModelForImageClassification.from_pretrained(MODEL_NAME).eval()

clip_model  = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
clip_proc   = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")

mtcnn = MTCNN(keep_all=True)

print("Models loaded.\n")

# =========================
# HELPERS
# =========================

def _infer(img: Image.Image):
    """Run the primary ViT classifier and return label→prob dict."""
    inputs = processor(images=img.resize((224, 224)), return_tensors="pt")
    with torch.no_grad():
        out   = model(**inputs)
        probs = F.softmax(out.logits, dim=1)[0]
    labels = model.config.id2label
    return {labels[i].lower(): probs[i].item() for i in range(len(probs))}


def _g(d, keys):
    """Max of requested keys from a probability dict."""
    return max(d.get(k, 0.0) for k in keys) if d else 0.0


def _infer_with_hidden(img: Image.Image):
    """Run ViT and return (probs_dict, last_hidden_state [1, seq, hidden])."""
    inputs = processor(images=img.resize((224, 224)), return_tensors="pt")
    with torch.no_grad():
        out = model(**inputs, output_hidden_states=True)
        probs = F.softmax(out.logits, dim=1)[0]
    labels = model.config.id2label
    prob_dict = {labels[i].lower(): probs[i].item() for i in range(len(probs))}
    hidden = out.hidden_states[-1] if out.hidden_states else None  # (1, seq_len, hidden)
    return prob_dict, hidden


# =========================
# CLIP
# =========================

def clip_score(img: Image.Image) -> dict:
    inputs = clip_proc(
        text=["real photograph", "ai generated image deepfake synthetic"],
        images=img,
        return_tensors="pt",
        padding=True,
    )
    with torch.no_grad():
        outputs = clip_model(**inputs)
    probs = outputs.logits_per_image.softmax(dim=1)[0]
    return {"real": probs[0].item(), "fake": probs[1].item()}


# =========================
# FACE DETECTION
# =========================

def detect_faces(img: Image.Image) -> list:
    boxes, probs = mtcnn.detect(img)
    if boxes is None:
        return []
    faces = []
    for box, prob in zip(boxes, probs):
        if prob is None or prob < 0.90:
            continue
        x1, y1, x2, y2 = map(int, box)
        if (x2 - x1) < 40 or (y2 - y1) < 40:
            continue
        faces.append(img.crop((x1, y1, x2, y2)))
    return faces


# =========================
# GRADCAM HEATMAP
# True GradCAM: gradients of fake-class logit w.r.t. last ViT hidden state
# =========================

def generate_heatmap(img: Image.Image) -> str | None:
    """
    Generate a proper GradCAM heatmap using real gradients.

    Strategy:
      1. Forward pass with grad enabled on the last hidden state patch tokens.
      2. Backprop the fake-class logit to get gradients at each patch.
      3. Global-average-pool the gradients → per-patch importance weights.
      4. Weighted sum of patch activations → spatial map.
      5. ReLU + normalize, upsample, apply colormap, overlay.
    """
    try:
        W, H = img.size
        small = img.resize((224, 224)).convert("RGB")
        inputs = processor(images=small, return_tensors="pt")

        # Determine fake class index
        labels = model.config.id2label
        fake_idx = next((i for i, lbl in labels.items() if 'fake' in lbl.lower() or 'ai' in lbl.lower()), 1)

        # Forward with gradients on hidden states
        model.zero_grad()
        out = model(**inputs, output_hidden_states=True)

        # last hidden state: (1, seq_len, hidden_dim)
        last_hidden = out.hidden_states[-1]  # retain for grad
        last_hidden.retain_grad()

        # Backprop fake logit
        fake_logit = out.logits[0, fake_idx]
        fake_logit.backward()

        grads = last_hidden.grad  # (1, seq_len, hidden_dim)
        if grads is None:
            raise ValueError("Gradients not available")

        # Patch tokens only (skip CLS at idx 0)
        patch_grads   = grads[0, 1:, :]        # (n_patches, hidden_dim)
        patch_acts    = last_hidden[0, 1:, :].detach()  # (n_patches, hidden_dim)

        # GradCAM: weight each channel by its mean gradient
        weights = patch_grads.mean(dim=-1)     # (n_patches,) — mean gradient per patch
        cam_flat = (weights * patch_acts.mean(dim=-1)).cpu().numpy()  # (n_patches,)

        # ReLU (only positive contributions)
        cam_flat = np.maximum(cam_flat, 0)

        # Safe reshape to square grid
        n_patches = cam_flat.shape[0]
        grid_size = int(np.sqrt(n_patches))
        valid_size = grid_size * grid_size
        cam_flat = cam_flat[:valid_size]
        cam_grid = cam_flat.reshape(grid_size, grid_size)

        # Normalize
        cam_min, cam_max = cam_grid.min(), cam_grid.max()
        if cam_max - cam_min < 1e-8:
            # Fallback if flat — use gradient norm instead
            grad_norm = patch_grads.norm(dim=-1).cpu().numpy()[:valid_size]
            cam_grid = grad_norm.reshape(grid_size, grid_size)
            cam_grid = (cam_grid - cam_grid.min()) / (cam_grid.max() - cam_grid.min() + 1e-8)
        else:
            cam_grid = (cam_grid - cam_min) / (cam_max - cam_min + 1e-8)

        # Upsample to 224×224, then to original resolution
        cam_224  = cv2.resize(cam_grid.astype(np.float32), (224, 224), interpolation=cv2.INTER_CUBIC)
        cam_full = cv2.resize(cam_224, (W, H), interpolation=cv2.INTER_CUBIC)

        # Slight smoothing to remove patch grid artifacts
        cam_full = cv2.GaussianBlur(cam_full, (9, 9), 0)
        cam_full = (cam_full - cam_full.min()) / (cam_full.max() - cam_full.min() + 1e-8)

        # Apply jet colormap
        colormap     = cv2.applyColorMap((cam_full * 255).astype(np.uint8), cv2.COLORMAP_JET)
        colormap_rgb = cv2.cvtColor(colormap, cv2.COLOR_BGR2RGB)

        # Overlay on original image — more transparent overlay so original is visible
        orig_np = np.array(img.convert("RGB"))
        overlay = (0.6 * orig_np + 0.4 * colormap_rgb).astype(np.uint8)

        # Encode
        buf = io.BytesIO()
        Image.fromarray(overlay).save(buf, format="PNG", optimize=True)
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    except Exception as e:
        print(f"[Heatmap error] {e}")
        return _fallback_heatmap(img)


def _fallback_heatmap(img: Image.Image) -> str | None:
    """Gaussian-blur based fallback if hidden states unavailable."""
    try:
        W, H = img.size
        gray = np.array(img.convert("L"), dtype=np.float32)
        heat = cv2.GaussianBlur(gray, (31, 31), 0)
        heat = cv2.normalize(heat, None, 0, 255, cv2.NORM_MINMAX)
        colormap = cv2.applyColorMap(heat.astype(np.uint8), cv2.COLORMAP_JET)
        colormap_rgb = cv2.cvtColor(colormap, cv2.COLOR_BGR2RGB)
        orig_np = np.array(img.convert("RGB"))
        overlay = (0.6 * orig_np + 0.4 * colormap_rgb).astype(np.uint8)
        buf = io.BytesIO()
        Image.fromarray(overlay).save(buf, format="PNG", optimize=True)
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return None


# =========================
# SCORE COMPUTATION
# =========================

def _compute_scores(img: Image.Image, model_mode: str = 'vit+clip+mtcnn') -> dict:
    """
    Returns normalized fake/real probabilities, label, confidence, and face count.
    model_mode controls which components of the pipeline are used.
    """
    use_clip  = 'clip'  in model_mode
    use_mtcnn = 'mtcnn' in model_mode
    use_vit   = 'vit'   in model_mode or model_mode == 'clip'  # always need some model

    # Primary model inference
    if use_vit or model_mode not in ('clip',):
        p = _infer(img)
        model_score = _g(p, ["fake", "ai"])
    else:
        model_score = 0.5

    # CLIP
    clip_data = {"real": 0.5, "fake": 0.5}
    if use_clip:
        clip_data = clip_score(img)
    elif model_mode == 'clip':
        # CLIP-only mode
        clip_data = clip_score(img)
        model_score = clip_data['fake']

    # Face analysis
    face_score = 0.0
    faces = []
    if use_mtcnn:
        faces = detect_faces(img)
        face_scores = []
        for f in faces:
            pf = _infer(f)
            face_scores.append(_g(pf, ["fake", "ai"]))
        face_score = float(np.mean(face_scores)) if face_scores else 0.0

    # Weights by mode
    weights = {
        'vit+clip+mtcnn': (0.55, 0.20, 0.25),
        'vit':            (1.00, 0.00, 0.00),
        'clip':           (0.00, 1.00, 0.00),
        'vit+mtcnn':      (0.65, 0.00, 0.35),
    }
    wm, wc, wf = weights.get(model_mode, (0.55, 0.20, 0.25))

    fake_raw = model_score * wm + clip_data["fake"] * wc + face_score * wf
    real_raw = (1 - model_score) * wm + clip_data["real"] * wc + (1 - face_score) * wf

    # No-face penalty (only for pipelines using MTCNN)
    if use_mtcnn and len(faces) == 0:
        fake_raw *= 0.92
        real_raw *= 1.04

    total = fake_raw + real_raw + 1e-8
    fake_prob = fake_raw / total
    real_prob = real_raw / total

    if fake_prob > real_prob:
        confidence = fake_prob
        label = "FAKE" if confidence >= 0.55 else "UNCERTAIN"
    else:
        confidence = real_prob
        label = "REAL" if confidence >= 0.55 else "UNCERTAIN"

    return {
        "label":      label,
        "confidence": round(confidence * 100, 2),
        "faces_found": len(faces),
        "fake_prob":  round(fake_prob * 100, 2),
        "real_prob":  round(real_prob * 100, 2),
    }


# =========================
# IMAGE ANALYSIS
# =========================

def analyze_image(path: str, model_mode: str = 'vit+clip+mtcnn') -> dict:
    img = Image.open(path).convert("RGB")
    result = _compute_scores(img, model_mode=model_mode)
    result["heatmap"]       = generate_heatmap(img)
    result["media_type"]    = "image"
    result["frames_scanned"] = 1
    return result


# =========================
# VIDEO ANALYSIS
# =========================

def analyze_video(path: str, model_mode: str = 'vit+clip+mtcnn') -> dict:
    cap = cv2.VideoCapture(path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    sample_count = min(12, max(1, total_frames))

    results      = []
    frame_timeline = []

    for i in range(sample_count):
        frame_idx = int(i * total_frames / sample_count)
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if ret:
            img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            r = _compute_scores(img, model_mode=model_mode)
            results.append(r)
            frame_timeline.append({
                "frame":     frame_idx,
                "time":      round(frame_idx / fps, 1),
                "fake_prob": r["fake_prob"],
                "real_prob": r["real_prob"],
            })

    cap.release()

    if not results:
        return {"label": "UNCERTAIN", "confidence": 0, "frames_scanned": 0, "media_type": "video"}

    labels   = [r["label"] for r in results]
    majority = Counter(labels).most_common(1)[0][0]
    majority_confs = [r["confidence"] for r in results if r["label"] == majority]
    avg_conf = sum(majority_confs) / len(majority_confs)

    avg_fake_prob = round(sum(r["fake_prob"] for r in results) / len(results), 2)
    avg_real_prob = round(sum(r["real_prob"] for r in results) / len(results), 2)

    # Heatmap from the most suspicious frame
    most_suspicious_idx = max(range(len(results)), key=lambda i: results[i]["fake_prob"])
    suspicious_frame_idx = frame_timeline[most_suspicious_idx]["frame"]

    cap2 = cv2.VideoCapture(path)
    cap2.set(cv2.CAP_PROP_POS_FRAMES, suspicious_frame_idx)
    ret2, frame2 = cap2.read()
    cap2.release()

    heatmap = None
    if ret2:
        img2 = Image.fromarray(cv2.cvtColor(frame2, cv2.COLOR_BGR2RGB))
        heatmap = generate_heatmap(img2)

    return {
        "label":          majority,
        "confidence":     round(avg_conf, 2),
        "fake_prob":      avg_fake_prob,
        "real_prob":      avg_real_prob,
        "faces_found":    results[0].get("faces_found", 0),
        "frames_scanned": len(results),
        "media_type":     "video",
        "frame_timeline": frame_timeline,
        "heatmap":        heatmap,
    }


# =========================
# CLI TEST
# =========================
if __name__ == "__main__":
    path = input("Enter image path: ").strip()
    result = analyze_image(path)
    print("\nRESULT:")
    for k, v in result.items():
        if k != "heatmap":
            print(f"  {k}: {v}")

---
title: DetruAI Forensics
emoji: 🔍
colorFrom: red
colorTo: gray
sdk: docker
pinned: false
---

# DetruAI — Deep Forensics Platform v4.0

AI-powered deepfake and synthetic media detection platform. Detects AI-generated images, videos, audio and text using a multi-model pipeline.

## Models Used

- **ViT-Base** — Primary image classifier (Ateeqq/ai-vs-human-image-detector)
- **CLIP** — Semantic similarity scoring (openai/clip-vit-base-patch32)
- **MTCNN** — Face detection and analysis (facenet-pytorch)

## Features

- 🖼️ Image deepfake detection with GradCAM heatmap
- 🎬 Video analysis with frame-by-frame timeline
- 🎙️ Audio synthesis & voice clone detection
- 📝 AI text authorship detection
- 🔬 Pixel-level image diff tool
- 📦 Batch upload (100+ files)
- 📊 Analytics dashboard
- 🌗 Dark / Light mode

## Supported Formats

| Type | Formats |
|------|---------|
| Image | JPG, PNG, WEBP, BMP |
| Video | MP4, AVI, MOV, MKV, WEBM |
| Audio | MP3, WAV, M4A, FLAC |

## Tech Stack

- **Backend** — Python, Flask
- **Models** — PyTorch, HuggingFace Transformers
- **Frontend** — Vanilla JS, CSS

## Local Setup

```bash
# Clone the repo
git clone https://huggingface.co/spaces/MHamza9111/detruai

# Install dependencies
pip install -r requirements.txt

# Run
python app.py
```

Open `http://localhost:5000`

## Docker

```bash
docker build -t detruai .
docker run -p 7860:7860 detruai
```

## Disclaimer

This tool is for educational and research purposes only. Detection accuracy is not 100% and should not be used as sole evidence in legal or professional decisions.

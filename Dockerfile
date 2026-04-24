FROM python:3.10-slim

WORKDIR /app

# Install system dependencies for opencv
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better Docker layer caching
COPY requirements.txt .

# Install CPU-only PyTorch first (smaller, faster)
RUN pip install --no-cache-dir torch==2.3.1 torchvision==0.18.1 --index-url https://download.pytorch.org/whl/cpu

# Install rest of dependencies (includes bcrypt now)
RUN pip install --no-cache-dir -r requirements.txt

# Copy all project files
COPY . .

# Create runtime directories
# uploads/ is temporary (cleared after each scan)
# user_histories/ persists per-user scan history
RUN mkdir -p uploads user_histories static/Logo.png || true
RUN mkdir -p uploads user_histories

# Move HTML/JS/CSS/assets into static folder for Flask static serving
# (index.html and login.html are served from static/)
RUN cp -n index.html static/index.html 2>/dev/null || true
RUN cp -n login.html static/login.html 2>/dev/null || true
RUN cp -n style.css static/style.css 2>/dev/null || true
RUN cp -n app.js static/app.js 2>/dev/null || true
RUN cp -n auth_guard.js static/auth_guard.js 2>/dev/null || true
RUN cp -n Logo.png static/Logo.png 2>/dev/null || true

# Hugging Face Spaces uses port 7860
EXPOSE 7860

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV HF_HUB_DISABLE_PROGRESS_BARS=1
# Set SECRET_KEY in your HuggingFace Space secrets for persistent sessions!
# ENV SECRET_KEY=your-secret-key-here

CMD ["python", "app.py"]

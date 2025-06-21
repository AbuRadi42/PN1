# Dockerfile

# 1. Base image
FROM python:3.10-slim

# 2. System deps for FFmpeg
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# 3. Add non-root user
RUN useradd --create-home appuser
WORKDIR /home/appuser
USER appuser

# 4. Copy & install Python deps
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 5. Copy application code
COPY --chown=appuser . .

# 6. Let Sanic pick up $PORT (defaults to 4200)
ENV PORT=4200

# 7. Use python -m sanic to avoid missing CLI; expand $PORT via shell
CMD sh -c "python -m sanic server:app --host 0.0.0.0 --port ${PORT:-4200} --workers 4 --access-log"

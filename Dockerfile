FROM python:3.10-slim

# Install ffmpeg
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Non‑root user
RUN useradd --create-home appuser
WORKDIR /home/appuser
USER appuser

# Python deps
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY --chown=appuser . .

# Let Sanic pick up $PORT (defaults to 4200)
ENV PORT=4200

# Start Sanic, expanding $PORT
CMD sh -c "sanic server:app --host 0.0.0.0 --port ${PORT:-4200} --workers 4 --access-log"

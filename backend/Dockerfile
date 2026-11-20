FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_APP=run.py \
    PORT=5001

WORKDIR /app

# Install system dependencies needed for compiling packages and healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libc6-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Create application user for security (non-root)
RUN useradd -m -u 1000 appuser && \
    mkdir -p /app/uploads/profile_photos \
             /app/uploads/message_media \
             /app/uploads/status_media \
             /app/uploads/kyc_documents && \
    chown -R appuser:appuser /app

# Copy application source code
COPY --chown=appuser:appuser . .

RUN chmod +x /app/docker-entrypoint.sh

USER appuser

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:5001/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["gunicorn", "-c", "gunicorn.conf.py", "run:app"]

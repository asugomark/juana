import os
from gevent import monkey
monkey.patch_all()

# Gunicorn configuration for Flask + Flask-SocketIO in production
bind = f"0.0.0.0:{os.environ.get('PORT', '5001')}"

# Worker class for Flask-SocketIO with gevent
worker_class = "geventwebsocket.gunicorn.workers.GeventWebSocketWorker"

# Single worker required for Socket.IO when running without Redis message queue.
# If REDIS_URL is configured in env, workers can be increased safely.
workers = int(os.environ.get("GUNICORN_WORKERS", "1"))
worker_connections = int(os.environ.get("GUNICORN_WORKER_CONNECTIONS", "1000"))

timeout = int(os.environ.get("GUNICORN_TIMEOUT", "120"))
keepalive = 5

accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("LOG_LEVEL", "info")
capture_output = True

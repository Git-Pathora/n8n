FROM python:3.12-slim

# Install Kent and flask-cors for browser CORS support
RUN pip install --no-cache-dir kent flask-cors

# Kent default port
EXPOSE 8000

# Copy and use our wrapper script that enables CORS
COPY kent_cors.py /app/kent_cors.py

CMD ["python", "/app/kent_cors.py"]

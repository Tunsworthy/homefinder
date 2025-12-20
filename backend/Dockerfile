FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV DATA_DIR=/data

# Install dependencies
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy current directory into image
COPY . /app

# Ensure entrypoint is executable
RUN chmod +x /app/entrypoint.sh

# Create mount point for outputs
VOLUME ["/data"]

ENTRYPOINT ["/app/entrypoint.sh"]

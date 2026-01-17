# Rejection Scanner: One-shot container for processing rejected/reviewed listings
# Usage: docker run -it --rm -v ./backend:/data housefinder-rejection-scanner
# Or via docker-compose: docker-compose run --rm rejection_scanner

FROM python:3.11-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rejection scanner script
COPY rejection_scanner.py .

# Set default entry point
ENTRYPOINT ["python", "rejection_scanner.py"]

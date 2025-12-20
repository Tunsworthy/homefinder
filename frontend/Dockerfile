FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1
ENV DATA_DIR=/data

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

EXPOSE 8080
CMD ["python", "app.py"]

"""
Configuration for messagebot - reads from environment variables
"""
import os

# Data directory for persistent state
DATA_DIR = os.getenv("DATA_DIR", "/data")

# MQTT Configuration
MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "8883"))
MQTT_CA_CERT_PATH = os.getenv("MQTT_CA_CERT_PATH", "/etc/ssl/certs/ca-certificates.crt")
MQTT_TOPIC_PREFIX = os.getenv("MQTT_TOPIC_PREFIX", "housefinder")
MQTT_TOPIC_NEW_LISTINGS = f"{MQTT_TOPIC_PREFIX}/new-listings"
MQTT_QOS = int(os.getenv("MQTT_QOS", "1"))
MQTT_CLIENT_ID = os.getenv("MQTT_CLIENT_ID", "housefinder-messagebot")

# Telegram Configuration
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

# Frontend URL for listing links
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5000")

# Validation
if not TELEGRAM_BOT_TOKEN:
    raise ValueError("TELEGRAM_BOT_TOKEN environment variable is required")
if not TELEGRAM_CHAT_ID:
    raise ValueError("TELEGRAM_CHAT_ID environment variable is required")

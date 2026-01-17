"""
MQTT configuration for Mosquitto broker with TLS support.
"""

import os

# MQTT Broker Configuration (must be provided via environment variables)
MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "8883"))
MQTT_CA_CERT_PATH = os.getenv("MQTT_CA_CERT_PATH", "")

# MQTT Topics
MQTT_TOPIC_NEW_LISTINGS = os.getenv("MQTT_TOPIC_NEW_LISTINGS", "housefinder/new-listings")

# MQTT Quality of Service and Retention
MQTT_QOS = int(os.getenv("MQTT_QOS", "1"))  # 1 = at-least-once delivery
MQTT_RETAIN = os.getenv("MQTT_RETAIN", "true").lower() == "true"  # Retain last message

# Client ID
MQTT_CLIENT_ID = os.getenv("MQTT_CLIENT_ID", "housefinder-backend")

# Connection settings
MQTT_KEEPALIVE = int(os.getenv("MQTT_KEEPALIVE", "60"))
MQTT_CONNECT_TIMEOUT = int(os.getenv("MQTT_CONNECT_TIMEOUT", "10"))

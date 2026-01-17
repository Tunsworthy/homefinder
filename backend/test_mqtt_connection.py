"""
Standalone MQTT connectivity test.
- Uses env vars: MQTT_HOST, MQTT_PORT, MQTT_CA_CERT_PATH, MQTT_USERNAME, MQTT_PASSWORD,
  MQTT_TEST_TOPIC (default: housefinder/healthcheck), MQTT_QOS (default: 1), MQTT_RETAIN (default: false),
  MQTT_INSECURE (set to true to skip TLS verification if no CA is provided).
- Exits with code 0 on success, 1 on any failure.
"""
import json
import logging
import os
import ssl
import sys
import time
import uuid
from typing import Optional

import paho.mqtt.client as mqtt

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
log = logging.getLogger("mqtt-test")

MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "8883"))
MQTT_CA_CERT_PATH = os.getenv("MQTT_CA_CERT_PATH", "")
MQTT_USERNAME = os.getenv("MQTT_USERNAME")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD")
MQTT_TEST_TOPIC = os.getenv("MQTT_TEST_TOPIC", "housefinder/healthcheck")
MQTT_QOS = int(os.getenv("MQTT_QOS", "1"))
MQTT_RETAIN = os.getenv("MQTT_RETAIN", "false").lower() == "true"
MQTT_INSECURE = os.getenv("MQTT_INSECURE", "false").lower() == "true"
MQTT_KEEPALIVE = int(os.getenv("MQTT_KEEPALIVE", "30"))
MQTT_CONNECT_TIMEOUT = int(os.getenv("MQTT_CONNECT_TIMEOUT", "10"))

_connected = False
_publish_rc: Optional[int] = None


def on_connect(client, userdata, flags, rc, properties=None):
    global _connected
    if rc == 0:
        _connected = True
        log.info(f"✅ Connected to {MQTT_HOST}:{MQTT_PORT}")
    else:
        log.error(f"❌ Connection failed rc={rc} ({mqtt.error_string(rc)})")


def on_publish(client, userdata, mid):
    global _publish_rc
    _publish_rc = mqtt.MQTT_ERR_SUCCESS
    log.info(f"✅ Publish acknowledged (mid={mid})")


def configure_tls(client: mqtt.Client):
    if MQTT_CA_CERT_PATH:
        if os.path.exists(MQTT_CA_CERT_PATH):
            client.tls_set(
                ca_certs=MQTT_CA_CERT_PATH,
                certfile=None,
                keyfile=None,
                tls_version=ssl.PROTOCOL_TLS_CLIENT,
            )
            log.info(f"TLS enabled with CA cert: {MQTT_CA_CERT_PATH}")
        else:
            log.error(f"CA cert not found at {MQTT_CA_CERT_PATH}")
            sys.exit(1)
    else:
        if MQTT_INSECURE:
            client.tls_set(tls_version=ssl.PROTOCOL_TLS_CLIENT)
            client.tls_insecure_set(True)
            log.warning("TLS set to insecure (no CA provided)")
        else:
            log.info("No CA cert provided; connecting without TLS validation")


def main():
    client_id = f"hf-test-{uuid.uuid4().hex[:8]}"
    client = mqtt.Client(client_id=client_id, protocol=mqtt.MQTTv5)
    client.on_connect = on_connect
    client.on_publish = on_publish

    configure_tls(client)

    if MQTT_USERNAME:
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

    log.info(f"Connecting to {MQTT_HOST}:{MQTT_PORT} (topic={MQTT_TEST_TOPIC})")
    client.connect(MQTT_HOST, MQTT_PORT, keepalive=MQTT_KEEPALIVE)
    client.loop_start()

    # Wait for connection
    start = time.time()
    while not _connected and (time.time() - start) < MQTT_CONNECT_TIMEOUT:
        time.sleep(0.1)

    if not _connected:
        log.error("Failed to connect within timeout")
        client.loop_stop()
        sys.exit(1)

    payload = {
        "message": "healthcheck",
        "client_id": client_id,
        "timestamp": time.time(),
    }

    log.info("Publishing test message…")
    res = client.publish(MQTT_TEST_TOPIC, json.dumps(payload), qos=MQTT_QOS, retain=MQTT_RETAIN)

    # Wait for publish ack
    start_pub = time.time()
    while _publish_rc is None and (time.time() - start_pub) < 5:
        time.sleep(0.1)

    client.loop_stop()
    client.disconnect()

    if _publish_rc == mqtt.MQTT_ERR_SUCCESS:
        log.info("✅ Test completed: publish succeeded")
        sys.exit(0)
    else:
        log.error("❌ Publish failed or not acknowledged")
        sys.exit(1)


if __name__ == "__main__":
    main()

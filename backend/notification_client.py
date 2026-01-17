"""
MQTT notification client for publishing new listings and pipeline events.
Uses paho-mqtt library with TLS support for Mosquitto broker.
"""

import json
import logging
import os
import uuid
from typing import Optional, Dict, Any
from datetime import datetime
import paho.mqtt.client as mqtt
from config_mq import (
    MQTT_HOST,
    MQTT_PORT,
    MQTT_CA_CERT_PATH,
    MQTT_TOPIC_NEW_LISTINGS,
    MQTT_QOS,
    MQTT_RETAIN,
    MQTT_CLIENT_ID,
    MQTT_KEEPALIVE,
    MQTT_CONNECT_TIMEOUT,
)
from schema import NewListingsPayload, HeartbeatPayload

logger = logging.getLogger(__name__)


class MQTTNotificationClient:
    """
    MQTT client for publishing notifications to Mosquitto broker.
    Handles TLS connections and graceful degradation if broker is unavailable.
    """

    def __init__(self, client_id: str = MQTT_CLIENT_ID):
        self.client_id = client_id
        self.client: Optional[mqtt.Client] = None
        self.connected = False
        self._init_client()

    def _init_client(self):
        """Initialize MQTT client with TLS settings"""
        try:
            self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, self.client_id)
            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self.client.on_publish = self._on_publish
            self.client.on_log = self._on_log
        except Exception as e:
            logger.error(f"[MQ] Failed to initialize MQTT client: {e}")

    def _on_connect(self, client, userdata, flags, rc):
        """MQTT on_connect callback"""
        if rc == 0:
            self.connected = True
            logger.info(f"[MQ] Connected to {MQTT_HOST}:{MQTT_PORT}")
        else:
            logger.error(f"[MQ] Connection failed with code {rc}")

    def _on_disconnect(self, client, userdata, rc):
        """MQTT on_disconnect callback"""
        self.connected = False
        if rc != 0:
            logger.warning(f"[MQ] Unexpected disconnect with code {rc}")

    def _on_publish(self, client, userdata, mid):
        """MQTT on_publish callback"""
        logger.debug(f"[MQ] Message {mid} published successfully")

    def _on_log(self, client, userdata, level, buf):
        """MQTT on_log callback"""
        logger.debug(f"[MQ] {buf}")

    def connect(self) -> bool:
        """
        Connect to MQTT broker with TLS.
        Returns True if connection successful, False otherwise.
        """
        if self.connected:
            return True

        try:
            # Set TLS version and certificate
            if os.path.exists(MQTT_CA_CERT_PATH):
                self.client.tls_set(
                    ca_certs=MQTT_CA_CERT_PATH,
                    certfile=None,
                    keyfile=None,
                    cert_reqs=mqtt.ssl.CERT_REQUIRED,
                    tls_version=mqtt.ssl.PROTOCOL_TLSv1_2,
                    ciphers=None,
                )
                logger.info(f"[MQ] TLS enabled with cert: {MQTT_CA_CERT_PATH}")
            else:
                logger.warning(f"[MQ] Certificate not found at {MQTT_CA_CERT_PATH}, connecting without TLS")
                # Optionally disable TLS validation for development
                if os.getenv("MQTT_INSECURE", "false").lower() == "true":
                    self.client.tls_insecure_set(True)

            # Connect to broker
            self.client.connect(
                MQTT_HOST,
                MQTT_PORT,
                keepalive=MQTT_KEEPALIVE,
            )
            self.client.loop_start()
            logger.info(f"[MQ] Connecting to {MQTT_HOST}:{MQTT_PORT}...")
            return True

        except Exception as e:
            logger.error(f"[MQ] Failed to connect to MQTT broker: {e}")
            self.connected = False
            return False

    def publish_new_listings(self, payload: NewListingsPayload) -> bool:
        """
        Publish new listings notification to MQTT topic.
        
        Args:
            payload: NewListingsPayload containing listing details
            
        Returns:
            True if publish successful, False otherwise
        """
        try:
            if not self.connected:
                if not self.connect():
                    logger.warning("[MQ] Not connected to broker, skipping publish")
                    return False

            message_json = payload.json()
            logger.info(
                f"[MQ] Publishing {payload.count} new listing(s) to {MQTT_TOPIC_NEW_LISTINGS}"
            )

            result = self.client.publish(
                MQTT_TOPIC_NEW_LISTINGS,
                message_json,
                qos=MQTT_QOS,
                retain=MQTT_RETAIN,
            )

            if result.rc != mqtt.MQTT_ERR_SUCCESS:
                logger.error(f"[MQ] Publish failed with code {result.rc}: {mqtt.error_string(result.rc)}")
                return False

            logger.info(f"[MQ] Message published successfully (message_id={payload.message_id})")
            return True

        except Exception as e:
            logger.error(f"[MQ] Error publishing message: {e}")
            return False

    def publish_heartbeat(self, pipeline_run_id: str, step_completed: int, new_listings_count: int = 0) -> bool:
        """
        Publish heartbeat message to indicate backend is running.
        
        Args:
            pipeline_run_id: ID of the current pipeline run
            step_completed: Which step just finished (1 or 2)
            new_listings_count: Number of new listings found (0 if none)
            
        Returns:
            True if publish successful, False otherwise
        """
        try:
            if not self.connected:
                if not self.connect():
                    logger.warning("[MQ] Not connected to broker, skipping heartbeat")
                    return False

            heartbeat_topic = f"{MQTT_HOST.split('.')[0]}-heartbeat" if '.' in MQTT_HOST else "housefinder-heartbeat"
            
            payload = HeartbeatPayload(
                message_id=str(uuid.uuid4()),
                timestamp=datetime.now().isoformat(),
                heartbeat_type="pipeline_run",
                pipeline_run_id=pipeline_run_id,
                last_step_completed=step_completed,
                new_listings_count=new_listings_count,
            )

            message_json = payload.json()
            logger.info(f"[MQ] Publishing heartbeat to {heartbeat_topic}")

            result = self.client.publish(
                heartbeat_topic,
                message_json,
                qos=MQTT_QOS,
                retain=False,  # Don't retain heartbeats
            )

            if result.rc != mqtt.MQTT_ERR_SUCCESS:
                logger.error(f"[MQ] Heartbeat publish failed with code {result.rc}: {mqtt.error_string(result.rc)}")
                return False

            logger.info(f"[MQ] Heartbeat published successfully (run={pipeline_run_id}, step={step_completed})")
            return True

        except Exception as e:
            logger.error(f"[MQ] Error publishing heartbeat: {e}")
            return False

    def disconnect(self):
        """Gracefully disconnect from MQTT broker"""
        try:
            if self.client:
                self.client.loop_stop()
                self.client.disconnect()
                self.connected = False
                logger.info("[MQ] Disconnected from MQTT broker")
        except Exception as e:
            logger.error(f"[MQ] Error during disconnect: {e}")

    def __del__(self):
        """Ensure disconnect on object destruction"""
        self.disconnect()

"""
Messagebot - MQTT subscriber that sends new listing notifications via Telegram
"""
import json
import logging
import ssl
import sys
import time
import requests
import paho.mqtt.client as mqtt

import config
from formatter import format_listings, format_heartbeat, format_rejection_summary

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("messagebot")


class TelegramSender:
    """Send messages via Telegram Bot API"""
    
    def __init__(self, bot_token: str, chat_id: str):
        self.bot_token = bot_token
        self.chat_id = chat_id
        self.api_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    
    def send_message(self, text: str) -> bool:
        """
        Send a message to Telegram.
        Returns True on success, False on failure.
        """
        try:
            payload = {
                "chat_id": self.chat_id,
                "text": text,
                "parse_mode": "Markdown",
                "disable_web_page_preview": True,
            }
            
            response = requests.post(self.api_url, json=payload, timeout=10)
            response.raise_for_status()
            
            logger.info(f"✅ Telegram message sent successfully")
            return True
        
        except requests.exceptions.HTTPError as e:
            try:
                error_detail = response.json()
                logger.error(f"❌ Telegram API error: {error_detail}")
            except:
                logger.error(f"❌ Telegram HTTP error {response.status_code}: {response.text}")
            return False
        except Exception as e:
            logger.error(f"❌ Failed to send Telegram message: {e}")
            return False


class MessageBot:
    """MQTT subscriber that forwards new listings to Telegram"""
    
    def __init__(self):
        self.telegram = TelegramSender(config.TELEGRAM_BOT_TOKEN, config.TELEGRAM_CHAT_ID)
        self.mqtt_client = None
        self.connected = False
    
    def on_connect(self, client, userdata, flags, rc, properties=None):
        """MQTT connection callback"""
        if rc == 0:
            self.connected = True
            logger.info(f"✅ Connected to MQTT broker: {config.MQTT_HOST}:{config.MQTT_PORT}")
            
            # Subscribe to new listings topic
            client.subscribe(config.MQTT_TOPIC_NEW_LISTINGS, qos=config.MQTT_QOS)
            logger.info(f"📬 Subscribed to topic: {config.MQTT_TOPIC_NEW_LISTINGS}")
            
            # Subscribe to rejection scanner topic
            rejection_topic = f"{config.MQTT_TOPIC_PREFIX}/rejection-scanner"
            client.subscribe(rejection_topic, qos=config.MQTT_QOS)
            logger.info(f"🔍 Subscribed to topic: {rejection_topic}")
            
            # Subscribe to heartbeat topics (host-based and prefix-based)
            heartbeat_topics = {
                "housefinder-heartbeat",
                f"{config.MQTT_TOPIC_PREFIX}-heartbeat",
            }
            if "." in config.MQTT_HOST:
                heartbeat_topics.add(f"{config.MQTT_HOST.split('.')[0]}-heartbeat")
            for hb_topic in heartbeat_topics:
                client.subscribe(hb_topic, qos=config.MQTT_QOS)
                logger.info(f"💓 Subscribed to topic: {hb_topic}")
        else:
            logger.error(f"❌ MQTT connection failed with code {rc}")
    
    def on_disconnect(self, client, userdata, rc):
        """MQTT disconnection callback"""
        self.connected = False
        if rc != 0:
            logger.warning(f"⚠ Unexpected disconnect (rc={rc}), will attempt reconnect")
    
    def on_message(self, client, userdata, msg):
        """MQTT message received callback"""
        try:
            logger.info(f"📨 Received message on {msg.topic}")
            
            # Parse JSON payload
            payload = json.loads(msg.payload.decode('utf-8'))
            
            # Check message type and route accordingly
            if "scanner_type" in payload and payload["scanner_type"] == "rejection_scanner":
                # Handle rejection scanner summary
                logger.info(f"🔍 Rejection scanner summary received")
                message = format_rejection_summary(payload)
                self.telegram.send_message(message)
            elif "heartbeat_type" in payload:
                # Handle heartbeat message
                logger.info(f"💓 Heartbeat received (step {payload.get('last_step_completed', 0)})")
                message = format_heartbeat(payload)
                self.telegram.send_message(message)
            else:
                # Handle new listings message
                logger.info(f"📊 Payload: {payload.get('count', 0)} new listings")
                
                # Format messages
                messages = format_listings(payload, config.FRONTEND_URL)
                
                # Send each message to Telegram
                for idx, message in enumerate(messages, 1):
                    logger.info(f"📤 Sending Telegram message {idx}/{len(messages)}")
                    success = self.telegram.send_message(message)
                    
                    if not success:
                        logger.error(f"Failed to send message {idx}/{len(messages)}")
                    
                    # Rate limit: wait between messages
                    if idx < len(messages):
                        time.sleep(1)
        
        except json.JSONDecodeError as e:
            logger.error(f"❌ Invalid JSON in message: {e}")
        except Exception as e:
            logger.error(f"❌ Error processing message: {e}", exc_info=True)
    
    def configure_mqtt_client(self):
        """Configure MQTT client with TLS"""
        self.mqtt_client = mqtt.Client(
            client_id=config.MQTT_CLIENT_ID,
            protocol=mqtt.MQTTv5
        )
        
        self.mqtt_client.on_connect = self.on_connect
        self.mqtt_client.on_disconnect = self.on_disconnect
        self.mqtt_client.on_message = self.on_message
        
        # Configure TLS
        if config.MQTT_CA_CERT_PATH:
            self.mqtt_client.tls_set(
                ca_certs=config.MQTT_CA_CERT_PATH,
                certfile=None,
                keyfile=None,
                tls_version=ssl.PROTOCOL_TLS_CLIENT,
            )
            logger.info(f"🔒 TLS enabled with CA: {config.MQTT_CA_CERT_PATH}")
    
    def run(self):
        """Main run loop"""
        logger.info("🤖 Messagebot starting...")
        
        self.configure_mqtt_client()
        
        try:
            logger.info(f"🔌 Connecting to MQTT broker: {config.MQTT_HOST}:{config.MQTT_PORT}")
            self.mqtt_client.connect(config.MQTT_HOST, config.MQTT_PORT, keepalive=60)
            
            # Blocking loop - will run forever
            logger.info("🔄 Starting MQTT loop...")
            self.mqtt_client.loop_forever()
        
        except KeyboardInterrupt:
            logger.info("⏸ Shutting down gracefully...")
            self.mqtt_client.disconnect()
        except Exception as e:
            logger.error(f"❌ Fatal error: {e}", exc_info=True)
            sys.exit(1)


if __name__ == "__main__":
    bot = MessageBot()
    bot.run()
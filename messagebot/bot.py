"""
Messagebot - MQTT subscriber that sends new listing notifications via Telegram
"""
import json
import logging
import ssl
import sys
import time
import hashlib
from pathlib import Path
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
        self.state_file = Path(config.DATA_DIR) / "messagebot_state.json"
        self.sent_messages = self.load_state()
    
    def load_state(self) -> dict:
        """Load message state from disk to avoid duplicates"""
        try:
            if self.state_file.exists():
                with open(self.state_file, 'r') as f:
                    state = json.load(f)
                    logger.info(f"📂 Loaded message state with {len(state.get('sent_hashes', []))} tracked messages")
                    return state
        except Exception as e:
            logger.warning(f"⚠ Could not load state file: {e}")
        
        return {"sent_hashes": [], "last_updated": None}
    
    def save_state(self):
        """Save message state to disk"""
        try:
            self.state_file.parent.mkdir(parents=True, exist_ok=True)
            
            # Keep only the last 1000 message hashes to prevent unbounded growth
            if len(self.sent_messages["sent_hashes"]) > 1000:
                self.sent_messages["sent_hashes"] = self.sent_messages["sent_hashes"][-1000:]
            
            with open(self.state_file, 'w') as f:
                json.dump(self.sent_messages, f, indent=2)
            logger.debug(f"💾 Saved message state")
        except Exception as e:
            logger.error(f"❌ Failed to save state: {e}")
    
    def message_hash(self, payload: dict) -> str:
        """Generate a unique hash for a message to detect duplicates"""
        # Create a stable hash based on message content
        # For new listings: use timestamp + listing IDs
        # For rejection scanner: use timestamp + summary
        # For heartbeat: use timestamp + step
        
        if "scanner_type" in payload and payload["scanner_type"] == "rejection_scanner":
            key = f"rejection_{payload.get('timestamp', '')}_{payload.get('summary', {}).get('marked_rejected', 0)}_{payload.get('summary', {}).get('marked_reviewed', 0)}"
        elif "heartbeat_type" in payload:
            key = f"heartbeat_{payload.get('timestamp', '')}_{payload.get('last_step_completed', 0)}"
        else:
            # New listings message
            listings = payload.get('listings', [])
            listing_ids = sorted([str(l.get('id', '')) for l in listings])
            key = f"listings_{payload.get('timestamp', '')}_{','.join(listing_ids[:10])}"  # Use first 10 IDs
        
        return hashlib.md5(key.encode()).hexdigest()
    
    def is_duplicate(self, payload: dict) -> bool:
        """Check if we've already sent this message"""
        msg_hash = self.message_hash(payload)
        return msg_hash in self.sent_messages["sent_hashes"]
    
    def mark_sent(self, payload: dict):
        """Mark a message as sent"""
        msg_hash = self.message_hash(payload)
        self.sent_messages["sent_hashes"].append(msg_hash)
        self.sent_messages["last_updated"] = time.time()
        self.save_state()
    
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
            
            # Check for duplicates
            if self.is_duplicate(payload):
                logger.info(f"⏭ Skipping duplicate message")
                return
            
            # Check message type and route accordingly
            if "scanner_type" in payload and payload["scanner_type"] == "rejection_scanner":
                # Handle rejection scanner summary
                logger.info(f"🔍 Rejection scanner summary received")
                message = format_rejection_summary(payload)
                success = self.telegram.send_message(message)
                if success:
                    self.mark_sent(payload)
            elif "heartbeat_type" in payload:
                # Handle heartbeat message
                logger.info(f"💓 Heartbeat received (step {payload.get('last_step_completed', 0)})")
                message = format_heartbeat(payload)
                success = self.telegram.send_message(message)
                if success:
                    self.mark_sent(payload)
            else:
                # Handle new listings message
                logger.info(f"📊 Payload: {payload.get('count', 0)} new listings")
                
                # Format messages
                messages = format_listings(payload, config.FRONTEND_URL)
                
                # Send each message to Telegram
                all_success = True
                for idx, message in enumerate(messages, 1):
                    logger.info(f"📤 Sending Telegram message {idx}/{len(messages)}")
                    success = self.telegram.send_message(message)
                    
                    if not success:
                        logger.error(f"Failed to send message {idx}/{len(messages)}")
                        all_success = False
                    
                    # Rate limit: wait between messages
                    if idx < len(messages):
                        time.sleep(1)
                
                # Only mark as sent if all messages were successful
                if all_success:
                    self.mark_sent(payload)
        
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
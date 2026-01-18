#!/usr/bin/env python3
"""
Rejection Scanner: Processes listings based on votes and marks them as rejected or reviewed.

Logic:
- tom==true && mq==true => workflow_status='reviewed'
- tom==false && mq==false => workflow_status='rejected'
- Otherwise (mixed votes) => leave unchanged

Runs once; suitable for external cron/scheduler triggering.
"""

import json
import logging
import os
import ssl
from pathlib import Path
from datetime import datetime
from typing import Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Optional MQTT support (gracefully degrades if not available)
try:
    import paho.mqtt.client as mqtt
    MQTT_AVAILABLE = True
except ImportError:
    MQTT_AVAILABLE = False
    logger.warning("paho-mqtt not installed, MQTT notifications disabled")


def load_votes(votes_file: Path) -> dict:
    """Load votes from votes.json."""
    if not votes_file.exists():
        logger.warning(f"Votes file not found: {votes_file}")
        return {}
    
    with open(votes_file, 'r') as f:
        return json.load(f)


def save_votes(votes: dict, votes_file: Path) -> None:
    """Save updated votes to votes.json."""
    with open(votes_file, 'w') as f:
        json.dump(votes, f, indent=2)
    logger.info(f"Saved updated votes to {votes_file}")


def process_votes(votes: dict) -> dict:
    """
    Process votes and update workflow_status based on tom/mq votes.
    
    Returns a dict with summary stats.
    """
    stats = {
        'total_voted': 0,
        'marked_reviewed': 0,
        'marked_rejected': 0,
        'left_unchanged': 0,
        'rejected_ids': [],
        'reviewed_ids': []
    }
    
    for listing_id, vote_data in votes.items():
        # Skip if no actual vote records (just workflow_status)
        if 'tom' not in vote_data and 'mq' not in vote_data:
            continue
        
        stats['total_voted'] += 1
        
        tom_vote = vote_data.get('tom')
        mq_vote = vote_data.get('mq')
        
        # Only process if both votes are explicitly set to boolean values
        if tom_vote is None or mq_vote is None:
            stats['left_unchanged'] += 1
            continue
        
        current_status = vote_data.get('workflow_status', 'active')
        
        # Check both true (reviewed) - only update if currently 'active' or no status
        if tom_vote is True and mq_vote is True:
            if current_status == 'active' or current_status is None:
                vote_data['workflow_status'] = 'reviewed'
                stats['marked_reviewed'] += 1
                stats['reviewed_ids'].append(listing_id)
                logger.debug(f"Marked {listing_id} as reviewed (tom=true, mq=true)")
            else:
                stats['left_unchanged'] += 1
                logger.debug(f"Skipped {listing_id} - already has status '{current_status}'")
        
        # Check both false (rejected) - only update if currently 'active' or no status
        elif tom_vote is False and mq_vote is False:
            if current_status == 'active' or current_status is None:
                vote_data['workflow_status'] = 'rejected'
                stats['marked_rejected'] += 1
                stats['rejected_ids'].append(listing_id)
                logger.debug(f"Marked {listing_id} as rejected (tom=false, mq=false)")
            else:
                stats['left_unchanged'] += 1
                logger.debug(f"Skipped {listing_id} - already has status '{current_status}'")
        
        # Mixed votes - leave unchanged
        else:
            stats['left_unchanged'] += 1
            logger.debug(f"Left {listing_id} unchanged (mixed votes: tom={tom_vote}, mq={mq_vote})")
    
    return stats


def send_mqtt_notification(stats: dict) -> bool:
    """
    Send rejection scanner summary via MQTT.
    Returns True if successful, False otherwise.
    """
    if not MQTT_AVAILABLE:
        logger.info("MQTT not available, skipping notification")
        return False
    
    mqtt_host = os.getenv('MQTT_HOST')
    mqtt_port = int(os.getenv('MQTT_PORT', '8883'))
    mqtt_ca_cert = os.getenv('MQTT_CA_CERT_PATH')
    mqtt_topic_prefix = os.getenv('MQTT_TOPIC_PREFIX', 'housefinder')
    mqtt_topic = f"{mqtt_topic_prefix}/rejection-scanner"
    
    if not mqtt_host:
        logger.info("MQTT_HOST not configured, skipping notification")
        return False
    
    try:
        # Create MQTT client
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, client_id="rejection-scanner")
        
        # Configure TLS if certificate provided
        if mqtt_ca_cert and os.path.exists(mqtt_ca_cert):
            client.tls_set(
                ca_certs=mqtt_ca_cert,
                certfile=None,
                keyfile=None,
                tls_version=ssl.PROTOCOL_TLS_CLIENT,
            )
            logger.info(f"TLS enabled with CA: {mqtt_ca_cert}")
        
        # Connect to broker
        logger.info(f"Connecting to MQTT broker: {mqtt_host}:{mqtt_port}")
        client.connect(mqtt_host, mqtt_port, keepalive=60)
        client.loop_start()
        
        # Prepare payload
        payload = {
            "scanner_type": "rejection_scanner",
            "timestamp": datetime.now().isoformat(),
            "summary": {
                "total_voted": stats['total_voted'],
                "marked_reviewed": stats['marked_reviewed'],
                "marked_rejected": stats['marked_rejected'],
                "left_unchanged": stats['left_unchanged'],
            },
            "rejected_ids": stats['rejected_ids'],
            "reviewed_ids": stats['reviewed_ids'],
        }
        
        # Publish message
        result = client.publish(mqtt_topic, json.dumps(payload), qos=1, retain=False)
        result.wait_for_publish(timeout=5)
        
        if result.is_published():
            logger.info(f"✅ MQTT notification sent to {mqtt_topic}")
            client.loop_stop()
            client.disconnect()
            return True
        else:
            logger.error("❌ Failed to publish MQTT message")
            client.loop_stop()
            client.disconnect()
            return False
    
    except Exception as e:
        logger.error(f"❌ MQTT notification failed: {e}")
        return False


def main():
    """Main entry point."""
    # Determine data directory (from env or default)
    import os
    data_dir = Path(os.getenv('DATA_DIR', '/data'))
    votes_file = data_dir / 'votes.json'
    
    logger.info(f"Starting rejection scanner with DATA_DIR={data_dir}")
    
    if not votes_file.exists():
        logger.error(f"Votes file not found: {votes_file}")
        return 1
    
    # Load votes
    votes = load_votes(votes_file)
    logger.info(f"Loaded {len(votes)} listing vote records")
    
    # Process votes
    stats = process_votes(votes)
    
    # Save updated votes
    save_votes(votes, votes_file)
    
    # Send MQTT notification
    send_mqtt_notification(stats)
    
    # Log summary
    logger.info("=" * 60)
    logger.info("REJECTION SCANNER SUMMARY")
    logger.info("=" * 60)
    logger.info(f"Total listings with votes: {stats['total_voted']}")
    logger.info(f"Marked as REVIEWED: {stats['marked_reviewed']}")
    logger.info(f"Marked as REJECTED: {stats['marked_rejected']}")
    logger.info(f"Left unchanged: {stats['left_unchanged']}")
    
    if stats['rejected_ids']:
        logger.info(f"\nRejected IDs ({len(stats['rejected_ids'])}):")
        for lid in sorted(stats['rejected_ids']):
            logger.info(f"  - {lid}")
    
    if stats['reviewed_ids']:
        logger.info(f"\nReviewed IDs ({len(stats['reviewed_ids'])}):")
        for lid in sorted(stats['reviewed_ids']):
            logger.info(f"  - {lid}")
    
    logger.info("=" * 60)
    return 0


if __name__ == '__main__':
    exit(main())

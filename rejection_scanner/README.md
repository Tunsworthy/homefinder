# Rejection Scanner Feature

## Overview

The **Rejection Scanner** is a one-shot container that processes all listings in `votes.json` and automatically marks listings as `rejected` or `reviewed` based on voting status:

- **`workflow_status='reviewed'`**: Set when both Tom and MQ have voted "yes" (tom==true && mq==true)
- **`workflow_status='rejected'`**: Set when both Tom and MQ have voted "no" (tom==false && mq==false)
- **No change**: Mixed votes or missing votes are left unchanged

After processing, the scanner sends an MQTT notification with a summary that the messagebot forwards to Telegram.

## How It Works

### 1. Scanner Script (`rejection_scanner/rejection_scanner.py`)

The scanner reads `backend/votes.json` and:
- Iterates through all listing IDs with vote records
- Checks the `tom` and `mq` boolean values
- Updates `workflow_status` field in each vote record
- Writes changes back to `votes.json` (idempotent)
- Sends MQTT notification with summary
- Logs summary statistics

### 2. Backend Pipeline Integration

**Files Updated:**
- `backend/step1_search_domain.py`: Loads votes and skips rejected listings
- `backend/step2_get_details.py`: Loads votes and skips processing rejected listings

The pipeline now:
- Loads `votes.json` at startup
- Identifies rejected listings (where `workflow_status='rejected'`)
- Skips fetching/updating data for rejected listings
- Logs when listings are skipped

### 3. API/Frontend Filtering

**Files Updated:**
- `frontend/app.py`: Updated `/api/listings` endpoint to exclude rejected listings by default

The API now:
- Excludes listings with `workflow_status='rejected'` from the main listings feed
- Supports `include_rejected=true` query parameter for admin/debugging access
- Includes workflow_status in listing responses

### 4. Frontend Display

The frontend automatically:
- Hides rejected listings from the UI (via API filtering)
- Shows "Rejected" badge on detail pages (if accessed directly)
- Shows "Reviewed" badge for reviewed listings

### 5. MQTT Notifications

**Files Updated:**
- `messagebot/bot.py`: Subscribes to rejection-scanner topic
- `messagebot/formatter.py`: Formats rejection summaries for Telegram

The messagebot now:
- Subscribes to `{prefix}/rejection-scanner` topic
- Receives scan summaries and formats them for Telegram
- Sends notifications with counts and sample IDs

## Usage

### Run Scanner via Docker Compose

One-shot run (recommended for scheduled/cron tasks):

```bash
docker-compose run --rm rejection_scanner
```

### Run Scanner via Docker CLI

```bash
docker build -t housefinder-rejection-scanner -f rejection_scanner/Dockerfile ./rejection_scanner
docker run -it --rm -v $(pwd)/backend:/data \
  -e MQTT_HOST=$MQTT_HOST \
  -e MQTT_PORT=$MQTT_PORT \
  -e MQTT_CA_CERT_PATH=$MQTT_CA_CERT_PATH \
  housefinder-rejection-scanner
```

### Run Scanner Directly (Python)

```bash
cd rejection_scanner
pip install -r requirements.txt
DATA_DIR=../backend python rejection_scanner.py
```

### Sample Output

```
2026-01-18 12:34:56,789 - INFO - Starting rejection scanner with DATA_DIR=/data
2026-01-18 12:34:56,890 - INFO - Loaded 150 listing vote records
2026-01-18 12:34:57,123 - INFO - Connecting to MQTT broker: mqtt.example.com:8883
2026-01-18 12:34:57,234 - INFO - TLS enabled with CA: /etc/letsencrypt/live/mqtt.example.com/chain.pem
2026-01-18 12:34:57,456 - INFO - ✅ MQTT notification sent to housefinder/rejection-scanner
============================================================
REJECTION SCANNER SUMMARY
============================================================
Total listings with votes: 150
Marked as REVIEWED: 45
Marked as REJECTED: 12
Left unchanged: 93

Rejected IDs (12):
  - 2020178514
  - 2020501136
  - ...

Reviewed IDs (45):
  - 2020419422
  - 2020218774
  - ...
============================================================
```

## MQTT Notifications

The scanner sends a summary notification via MQTT when complete. This allows the messagebot to send Telegram notifications about scan results.

### MQTT Message Format

**Topic:** `{MQTT_TOPIC_PREFIX}/rejection-scanner` (default: `housefinder/rejection-scanner`)

**Payload:**
```json
{
  "scanner_type": "rejection_scanner",
  "timestamp": "2026-01-18T12:34:57.123456+11:00",
  "summary": {
    "total_voted": 150,
    "marked_reviewed": 45,
    "marked_rejected": 12,
    "left_unchanged": 93
  },
  "rejected_ids": ["2020178514", "2020501136", ...],
  "reviewed_ids": ["2020419422", "2020218774", ...]
}
```

### Environment Variables

For MQTT notifications to work, set these environment variables:

- `MQTT_HOST`: MQTT broker hostname (required)
- `MQTT_PORT`: MQTT broker port (default: 8883)
- `MQTT_CA_CERT_PATH`: Path to CA certificate for TLS (optional)
- `MQTT_TOPIC_PREFIX`: Topic prefix (default: housefinder)

**Note:** MQTT is optional. If not configured, the scanner will still work but won't send notifications.

### Telegram Notifications

The messagebot automatically subscribes to `{prefix}/rejection-scanner` and formats scan summaries as Telegram messages:

```
🔍 Rejection Scanner Complete

📊 Summary:
• Total listings with votes: 150
• ✅ Marked as Reviewed: 45
• ❌ Marked as Rejected: 12
• ⏺ Left unchanged: 93

⏰ 2026-01-18T12:34:57.123456+11:00

🚫 Rejected (12):
• 2020178514
• 2020501136
• ... and 10 more

✅ Reviewed (45):
• 2020419422
• 2020218774
• ... and 43 more
```

## Scheduling

### Cron Example

To run the scanner daily at 2 AM:

```bash
0 2 * * * cd /path/to/housefinder/domain && docker-compose run --rm rejection_scanner
```

### Kubernetes CronJob Example

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: housefinder-rejection-scanner
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: scanner
            image: housefinder-rejection-scanner:latest
            env:
            - name: DATA_DIR
              value: /data
            - name: MQTT_HOST
              value: mqtt.example.com
            - name: MQTT_PORT
              value: "8883"
            - name: MQTT_CA_CERT_PATH
              value: /certs/ca.pem
            volumeMounts:
            - name: data
              mountPath: /data
            - name: certs
              mountPath: /certs
          volumes:
          - name: data
            hostPath:
              path: /path/to/backend
          - name: certs
            secret:
              secretName: mqtt-ca-cert
          restartPolicy: OnFailure
```

## Data Flow

```
votes.json (tom/mq voting)
    ↓ [rejection_scanner]
votes.json (with workflow_status added)
    ↓ [sends MQTT message]
messagebot receives notification
    ↓ [formats and sends to Telegram]
User receives summary on Telegram
    ↓ [backend pipeline loads votes]
Listing files only updated if not rejected
    ↓ [API filters rejected from /api/listings]
Frontend UI only shows active/reviewed
```

## Workflow Status Values

Currently supported values in `votes.json`:

| Status | Description | Backend Action | Frontend Display | Notification |
|--------|-------------|-----------------|------------------|--------------|
| `rejected` | Both voted no | Skip processing/updates | Hidden from list | ❌ Included in summary |
| `reviewed` | Both voted yes | Process normally | Shows badge | ✅ Included in summary |
| *(none)* | Mixed or no votes | Process normally | Shows as "Active" | ⏺ Count only |

## Notes

- **Authoritative source**: `votes.json` is the authoritative source for rejection status
- **Idempotent**: Running the scanner multiple times is safe; it won't corrupt data
- **No DB required**: Works with JSON files; DB support can be added later
- **Read-only votes.json**: Scanner reads votes.json but only writes `workflow_status` field
- **Pipeline compatibility**: Both step1 and step2 now respect rejection status
- **MQTT optional**: Scanner works without MQTT; notifications are a bonus feature
- **Graceful degradation**: If MQTT is unavailable, scanner completes successfully without notification

## API Query Parameters

### Exclude/Include Rejected

```bash
# Default: exclude rejected
GET /api/listings

# Include rejected (admin/debug)
GET /api/listings?include_rejected=true
```

### Combined Filters

```bash
# Available listings, exclude rejected, no votes
GET /api/listings?status=available&exclude_voted_mode=either
```

## Troubleshooting

### Scanner shows no rejected/reviewed

- Check `votes.json` format: keys should be listing IDs, values should have `tom` and `mq` boolean fields
- Ensure both `tom` and `mq` are strictly `true` or `false` (not null or strings)

### Rejected listings still showing in UI

- Verify votes.json was updated: check for `workflow_status` field
- Check API is reading the latest votes.json
- Try refreshing frontend (clear cache)

### Pipeline still processing rejected listings

- Verify `votes.json` exists in `DATA_DIR`
- Check pipeline logs for "Loaded votes" message
- Ensure `workflow_status='rejected'` is set in votes.json

### MQTT notifications not working

- Check MQTT environment variables are set
- Verify MQTT broker is accessible
- Check messagebot logs for subscription confirmation
- Test MQTT connection: `mosquitto_pub -h $MQTT_HOST -p $MQTT_PORT -t test/topic -m "test"`
- Ensure CA certificate path is correct and accessible

### Telegram not receiving messages

- Check messagebot is running: `docker ps | grep messagebot`
- Verify messagebot subscribed to rejection-scanner topic (check logs)
- Test Telegram bot token and chat ID with a manual message
- Check messagebot logs for errors

## Future Enhancements

- [ ] Database persistence (currently JSON-only)
- [ ] Web UI to manually trigger/schedule scans
- [ ] Configurable rejection logic (e.g., any vote match)
- [ ] Webhook/API integration for external schedulers
- [ ] Metrics/dashboard for rejection statistics
- [ ] Retry logic for failed MQTT publishes
- [ ] Batch notification mode (accumulate multiple scans)

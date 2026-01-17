# Rejection Scanner Feature

## Overview

The **Rejection Scanner** is a one-shot container that processes all listings in `votes.json` and automatically marks listings as `rejected` or `reviewed` based on voting status:

- **`workflow_status='reviewed'`**: Set when both Tom and MQ have voted "yes" (tom==true && mq==true)
- **`workflow_status='rejected'`**: Set when both Tom and MQ have voted "no" (tom==false && mq==false)
- **No change**: Mixed votes or missing votes are left unchanged

## How It Works

### 1. Scanner Script (`backend/rejection_scanner.py`)

The scanner reads `backend/votes.json` and:
- Iterates through all listing IDs with vote records
- Checks the `tom` and `mq` boolean values
- Updates `workflow_status` field in each vote record
- Writes changes back to `votes.json` (idempotent)
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

## Usage

### Run Scanner via Docker Compose

One-shot run (recommended for scheduled/cron tasks):

```bash
docker-compose run --rm rejection_scanner
```

### Run Scanner via Docker CLI

```bash
docker build -t housefinder-rejection-scanner -f backend/Dockerfile.scanner ./backend
docker run -it --rm -v $(pwd)/backend:/data housefinder-rejection-scanner
```

### Run Scanner Directly (Python)

```bash
cd backend
DATA_DIR=. python rejection_scanner.py
```

### Sample Output

```
2026-01-18 12:34:56,789 - INFO - Starting rejection scanner with DATA_DIR=/data
2026-01-18 12:34:56,890 - INFO - Loaded 150 listing vote records
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
            volumeMounts:
            - name: data
              mountPath: /data
          volumes:
          - name: data
            hostPath:
              path: /path/to/backend
          restartPolicy: OnFailure
```

## Data Flow

```
votes.json
    ↓
[rejection_scanner.py]
    ↓ (updates workflow_status)
votes.json (with workflow_status field)
    ↓
[API reads votes.json]
    ↓ (filters rejected)
/api/listings (no rejected)
    ↓
[Frontend loads listings]
    ↓ (no rejected shown)
User sees list without rejected
```

## Workflow Status Values

Currently supported values in `votes.json`:

| Status | Description | Backend Action | Frontend Display |
|--------|-------------|-----------------|------------------|
| `rejected` | Both voted no | Skip processing/updates | Hidden from list |
| `reviewed` | Both voted yes | Process normally | Shows badge |
| *(none)* | Mixed or no votes | Process normally | Shows as "Active" |

## Notes

- **Authoritative source**: `votes.json` is the authoritative source for rejection status
- **Idempotent**: Running the scanner multiple times is safe; it won't corrupt data
- **No DB required**: Works with JSON files; DB support can be added later
- **Read-only votes.json**: Scanner reads votes.json but only writes `workflow_status` field
- **Pipeline compatibility**: Both step1 and step2 now respect rejection status

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

## Future Enhancements

- [ ] Database persistence (currently JSON-only)
- [ ] Web UI to manually trigger/schedule scans
- [ ] Configurable rejection logic (e.g., any vote match)
- [ ] Webhook/API integration for external schedulers
- [ ] Metrics/dashboard for rejection statistics

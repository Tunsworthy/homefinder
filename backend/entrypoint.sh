#!/usr/bin/env bash
set -euo pipefail

# Ensure data dir exists and is writable
mkdir -p "${DATA_DIR:-/data}"

echo "Starting step 1: fetching listing IDs"
python step1_search_domain.py

echo "Starting step 2: fetching listing details"
python step2_get_details.py

echo "Starting step 3: computing travel times"
python step3_comutedetails.py

echo "Starting step 4: backfill suburb data"
python step4_backfill_suburbs.py

echo "All steps finished. Outputs are in ${DATA_DIR:-/data}"

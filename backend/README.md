# Housefinder (domain) Docker image

This folder contains three scripts that run in sequence inside a container:
- `step1_search_domain.py` — fetch listing IDs into `listing_ids.json`
- `step2_get_details.py` — fetch listing details into `listings/`
- `step3_comutedetails.py` — compute travel times (requires Google Directions API key) and write `travel_times.csv`

Files are written to a volume mounted at `/data` inside the container. The code reads the output path from the `DATA_DIR` env var (defaults to `.`).

Required env vars:
- `GOOGLE_API_KEY` — API key for Google Directions API (used by `step3_comutedetails.py`).

Build and run with Docker:

```bash
# from this directory (domain)
docker build -t housefinder:latest .
# run with an output folder mounted and the API key in the environment
mkdir -p ./data
docker run --rm -e GOOGLE_API_KEY="<your-key>" -v "$(pwd)/data:/data" housefinder:latest
```

Or with docker-compose (reads `GOOGLE_API_KEY` from your environment or a `.env` file):

```bash
# create data folder
mkdir -p ./data
# then
docker-compose up --build
```

Outputs (in `./data`):
- `listing_ids.json`
- `listings/` directory with per-listing JSON files
- `travel_times.csv`

Notes:
- The container runs the three scripts in order and exits when finished.
- If you prefer the container to stay alive, modify `entrypoint.sh` accordingly.

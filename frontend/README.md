Frontend service

This is a small Flask app that reads listing JSON files from a mounted `DATA_DIR` (default `/data`) and provides:

- `GET /` — main page with infinite scrolling listings
- `GET /listing/<id>` — detail page
- `GET /api/listings?offset=0&limit=20` — paginated JSON summaries
- `GET /api/listing/<id>` — full JSON for a listing

To run locally (from `domain` folder) with docker-compose already configured in this repo:

```bash
# ensure ./data exists and contains listings (from your domain container run)
mkdir -p ./data/listings
# build and run frontend service along with housefinder if using domain/docker-compose.yml
docker-compose up --build frontend

# or build the frontend image directly
cd frontend
docker build -t housefinder-frontend:latest .
docker run --rm -p 8080:8080 -v "$(pwd)/../data:/data" housefinder-frontend:latest
```

Open http://localhost:8080
Added
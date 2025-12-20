# calculate_travel_times.py
import os
import json
import csv
import urllib.parse
import requests
import datetime
from zoneinfo import ZoneInfo  # Python 3.9+

DATA_DIR = os.environ.get("DATA_DIR", ".")
API_KEY = os.environ.get("GOOGLE_API_KEY")
LISTINGS_DIR = os.path.join(DATA_DIR, "listings")
OFFICE_ADDRESS = "10 Castlereagh St, Sydney NSW 2000"
OUTPUT_CSV = os.path.join(DATA_DIR, "travel_times.csv")
TIMEZONE = "Australia/Sydney"

if not API_KEY:
    print("[ERROR] GOOGLE_API_KEY environment variable not set. Aborting.")
    raise SystemExit(1)

def has_travel_time(listing: dict) -> bool:
    return (
        listing.get("travel_duration_seconds") is not None
    )


def get_next_business_day_9am_ts():
    """Return unix timestamp (int) for next business day at 9:00 AM in Australia/Sydney."""
    tz = ZoneInfo(TIMEZONE)
    now = datetime.datetime.now(tz)

    # start from tomorrow
    next_day = (now + datetime.timedelta(days=1)).replace(
        hour=9, minute=0, second=0, microsecond=0
    )

    # If next_day falls on weekend, advance to Monday
    while next_day.weekday() >= 5:  # 5 = Saturday, 6 = Sunday
        next_day += datetime.timedelta(days=1)
        next_day = next_day.replace(hour=9, minute=0, second=0, microsecond=0)

    # return epoch seconds
    return int(next_day.timestamp())


def build_directions_url(origin, destination, arrival_ts):
    base = "https://maps.googleapis.com/maps/api/directions/json?"
    params = {
        "origin": origin,
        "destination": destination,
        "mode": "transit",
        "arrival_time": str(arrival_ts),
        "key": API_KEY,
    }
    return base + urllib.parse.urlencode(params)


def build_google_maps_link(origin, destination):
    params = {
        "api": "1",
        "origin": origin,
        "destination": destination,
        "travelmode": "transit",
    }
    return "https://www.google.com/maps/dir/?" + urllib.parse.urlencode(params)


def get_travel_time_for_origin(origin_address):
    arrival_ts = get_next_business_day_9am_ts()
    url = build_directions_url(origin_address, OFFICE_ADDRESS, arrival_ts)
    print("Requesting:", url)

    try:
        resp = requests.get(url, timeout=15)
    except Exception as e:
        print("  [ERROR] HTTP request failed for", origin_address, "-", e)
        return None

    if resp.status_code != 200:
        print("  [ERROR] HTTP", resp.status_code, resp.text)
        return None

    data = resp.json()
    status = data.get("status")

    if status != "OK":
        print(f"  [WARN] Google API status = {status} for origin='{origin_address}'")
        if "error_message" in data:
            print("   error_message:", data["error_message"])
        return None

    try:
        leg = data["routes"][0]["legs"][0]
        return {
            "summary": {
                "duration_text": leg["duration"]["text"],
                "duration_seconds": leg["duration"]["value"],
            },
            "arrival_timestamp": arrival_ts,
            "raw_response": data,
        }
    except Exception as e:
        print("  [ERROR] Parsing Google response for", origin_address, "-", e)
        return None



def safe_filename(id_str):
    return f"{id_str}.json"


def process_listings():
    # Build list of CSV rows (fresh file each run)
    csv_rows = []

    # Make sure listings dir exists
    if not os.path.isdir(LISTINGS_DIR):
        print(f"Listings directory '{LISTINGS_DIR}' not found")
        return

    # Iterate files
    files = sorted(os.listdir(LISTINGS_DIR))
    for filename in files:
        if not filename.lower().endswith(".json"):
            continue

        path = os.path.join(LISTINGS_DIR, filename)
        try:
            with open(path, "r", encoding="utf8") as f:
                listing = json.load(f)
        except Exception as e:
            print(f"  [WARN] Could not read {filename}: {e}")
            continue

        listing_id = listing.get("id") or filename.replace(".json", "")
        origin_address = (listing.get("address") or "").strip()
        
        # Skip listings that already have travel time
        if has_travel_time(listing):
            print(f"  [SKIP] {listing_id} — travel time already present")
            csv_rows.append({
                "id": listing_id,
                "address": listing.get("address"),
                "travel_duration_text": listing.get("travel_duration_text"),
                "travel_duration_seconds": listing.get("travel_duration_seconds"),
                "google_maps_url": listing.get("google_maps_url"),
            })
            continue

        if not origin_address:
            print(f"  [SKIP] {listing_id} — no address present in JSON")
            # still include a CSV row marking missing address if you want, or skip completely
            csv_rows.append({
                "id": listing_id,
                "address": None,
                "travel_duration_text": None,
                "travel_duration_seconds": None,
                "google_maps_url": None
            })
            continue

        # Normalise address slightly (remove excessive commas/newlines)
        origin_normalised = " ".join(origin_address.split())
        print(f"\nProcessing {listing_id}: {origin_normalised}")

        travel = get_travel_time_for_origin(origin_normalised)

        if not travel:
            print(f"  [WARN] No transit result for {listing_id} — skipping JSON update")
            csv_rows.append({
                "id": listing_id,
                "address": origin_normalised,
                "travel_duration_text": None,
                "travel_duration_seconds": None,
                "google_maps_url": None
            })
            continue

        # Build google maps url (human-friendly)
        gmaps_link = build_google_maps_link(origin_normalised, OFFICE_ADDRESS)

        # Update JSON in-place
        listing["travel_duration_text"] = travel["summary"]["duration_text"]
        listing["travel_duration_seconds"] = travel["summary"]["duration_seconds"]
        listing["travel_arrival_timestamp"] = travel["arrival_timestamp"]
        listing["google_maps_url"] = gmaps_link

        listing["google_transit"] = {
            "queried_at": datetime.datetime.now(
                ZoneInfo(TIMEZONE)
            ).isoformat(),
            "arrival_timestamp": travel["arrival_timestamp"],
            "request": {
                "origin": origin_normalised,
                "destination": OFFICE_ADDRESS,
                "mode": "transit"
            },
            "response": travel["raw_response"]
            }   


        try:
            with open(path, "w", encoding="utf8") as f:
                json.dump(listing, f, indent=2, ensure_ascii=False)
            print(f"  [OK] Updated {filename}")
        except Exception as e:
            print(f"  [ERROR] Failed to write {filename}: {e}")

        # Append CSV row
        csv_rows.append({
            "id": listing_id,
            "address": origin_normalised,
            "travel_duration_text": travel["summary"]["duration_text"],
            "travel_duration_seconds": travel["summary"]["duration_seconds"],
            "google_maps_url": gmaps_link
        })


    # Write summary CSV with header even if empty
    fieldnames = ["id", "address", "travel_duration_text", "travel_duration_seconds", "google_maps_url"]
    try:
        with open(OUTPUT_CSV, "w", encoding="utf8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(csv_rows)
        print(f"\n✔ CSV written to: {OUTPUT_CSV}")
    except Exception as e:
        print("  [ERROR] Failed to write CSV:", e)


if __name__ == "__main__":
    process_listings()

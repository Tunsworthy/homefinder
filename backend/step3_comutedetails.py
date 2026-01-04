# calculate_travel_times.py
import os
import json
import csv
import urllib.parse
import requests
import datetime
from typing import Optional
from zoneinfo import ZoneInfo  # Python 3.9+

DATA_DIR = os.environ.get("DATA_DIR", ".")
API_KEY = os.environ.get("GOOGLE_API_KEY")
LISTINGS_DIR = os.path.join(DATA_DIR, "listings")
COMMUTE_DIR = os.path.join(DATA_DIR, "commute")
CONFIG_PATH = os.path.join(DATA_DIR, "commute_config.json")
OUTPUT_CSV = os.path.join(DATA_DIR, "travel_times.csv")
TIMEZONE = "Australia/Sydney"

if not API_KEY:
    print("[ERROR] GOOGLE_API_KEY environment variable not set. Aborting.")
    raise SystemExit(1)

def has_travel_time(listing: dict, listing_id: Optional[str] = None) -> bool:
    """Return True if commute output file exists for this listing.

    New behaviour: prefer the presence of `commute/<listing_id>.json`.
    If `listing_id` is not provided, try to read it from `listing['id']`.
    """
    try:
        lid = listing_id or listing.get("id")
        if not lid:
            return False

        commute_file = os.path.join(COMMUTE_DIR, safe_filename(lid))
        if not os.path.isfile(commute_file):
            return False

        # load per-listing commute output
        try:
            with open(commute_file, 'r', encoding='utf8') as f:
                out = json.load(f)
        except Exception:
            return False

        per = out.get("commutes") or []

        # load config to know expected number of commutes
        cfg = load_commute_config() or {}
        expected = cfg.get("commutes", [])

        if expected:
            # require the same number of commute entries and that each has a non-null result
            if len(per) != len(expected):
                return False
            for item in per:
                if item.get("result") is None:
                    return False
            return True
        else:
            # no config present: require that all per-listing commutes have results
            if not per:
                return False
            return all(item.get("result") is not None for item in per)
    except Exception:
        return False


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


def build_directions_url(origin, destination, arrival_ts, mode="transit"):
    base = "https://maps.googleapis.com/maps/api/directions/json?"
    params = {
        "origin": origin,
        "destination": destination,
        "mode": mode,
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


def get_travel_time_for_origin(origin_address, destination_address, arrival_ts, mode="transit"):
    url = build_directions_url(origin_address, destination_address, arrival_ts, mode=mode)
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
        routes = data.get("routes", [])
        if not routes:
            return None

        # compute best route (by total duration)
        best_total = None
        best_text = None

        for r in routes:
            legs = r.get("legs", [])
            total_seconds = 0
            total_text = []

            for leg in legs:
                dur = leg.get("duration", {}).get("value", 0)
                total_seconds += dur
                if leg.get("duration", {}).get("text"):
                    total_text.append(leg["duration"]["text"])

            # update best route
            if best_total is None or total_seconds < best_total:
                best_total = total_seconds
                best_text = ", ".join(total_text) if total_text else None

        if best_total is None:
            return None

        # Do NOT compute nearest station here — listing-level nearest station
        # should be computed once per-listing (see `process_listings`).
        return {
            "summary": {
                "duration_text": best_text or (str(int(best_total // 60)) + " mins"),
                "duration_seconds": int(best_total),
            },
            "arrival_timestamp": arrival_ts,
            "raw_response": data,
        }
    except Exception as e:
        print("  [ERROR] Parsing Google response for", origin_address, "-", e)
        return None


def find_nearest_transit_station(lat, lng):
    """Two-step: use Places v1 searchNearby with rankPreference=DISTANCE to
    get the nearest `train_station`, then request a walking Directions route
    to compute walking duration and distance. Fall back to legacy Nearby
    Search if v1 fails.
    """
    try:
        places_url = "https://places.googleapis.com/v1/places:searchNearby"

        radius = int(os.environ.get("PLACES_RADIUS", "2000"))
        body = {
            "includedTypes": ["train_station"],
            "maxResultCount": 5,
            "rankPreference": "DISTANCE",
            "locationRestriction": {
                "circle": {
                    "center": {
                        "latitude": float(lat),
                        "longitude": float(lng),
                    },
                    "radius": radius,
                }
            },
        }

        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": API_KEY,
            # request displayName, location and types (and name resource id)
            "X-Goog-FieldMask": (
                "places.displayName,"
                "places.location,"
                "places.types,"
                "places.name"
            ),
        }

        # call v1 searchNearby
        try:
            resp = requests.post(places_url, json=body, headers=headers, timeout=10)
        except Exception as e:
            print(f"  [WARN] Places v1 request failed: {e}")
            resp = None

        pdata = None
        if resp is not None and resp.status_code == 200:
            try:
                pdata = resp.json()
            except Exception:
                pdata = None
        else:
            if resp is not None:
                print(f"  [WARN] Places v1 returned HTTP {resp.status_code}")

        places_list = (pdata.get("places") if isinstance(pdata, dict) else None) or []

        if places_list:
            # pick the first place returned under DISTANCE ranking
            for entry in places_list:
                place = entry.get("place") if isinstance(entry, dict) and "place" in entry else entry
                if not isinstance(place, dict):
                    continue
                types = place.get("types") or []
                if "train_station" not in types:
                    continue
                if "bus_station" in types:
                    continue

                # displayName may be a dict {text:...} or a string
                display = place.get("displayName") or place.get("display_name") or place.get("name")
                if isinstance(display, dict):
                    name = display.get("text") or display.get("displayName")
                else:
                    name = display
                if not name:
                    continue

                # location may be in different shapes; try common variants
                loc = place.get("location") or place.get("geometry") or {}
                plat = None
                plng = None
                if isinstance(loc, dict):
                    plat = loc.get("latitude") or loc.get("lat") or (loc.get("latLng") or {}).get("lat")
                    plng = loc.get("longitude") or loc.get("lng") or (loc.get("latLng") or {}).get("lng")

                if plat is None or plng is None:
                    continue

                # request walking route to this station
                now_ts = int(datetime.datetime.now().timestamp())
                dest = f"{plat},{plng}"
                try:
                    r2 = requests.get(build_directions_url(f"{lat},{lng}", dest, now_ts, mode="walking"), timeout=10)
                except Exception as e:
                    print(f"    [DEBUG] Directions request failed for {name}: {e}")
                    continue
                if r2.status_code != 200:
                    print(f"    [DEBUG] Directions HTTP {r2.status_code} for {name}")
                    continue
                try:
                    d2 = r2.json()
                except Exception as e:
                    print(f"    [DEBUG] Failed to parse directions JSON for {name}: {e}")
                    continue
                if d2.get("status") != "OK":
                    print(f"    [DEBUG] Directions status {d2.get('status')} for {name}")
                    continue
                routes = d2.get("routes", [])
                if not routes:
                    continue
                legs = routes[0].get("legs", [])
                if not legs:
                    continue
                leg = legs[0]
                walking_seconds = leg.get("duration", {}).get("value")
                walking_distance = leg.get("distance", {}).get("value")
                if walking_seconds is None:
                    continue

                return {
                    "name": name,
                    "walking_seconds": int(walking_seconds),
                    "walking_distance_m": int(walking_distance) if walking_distance is not None else None,
                }

        else:
            print("  [DEBUG] Places v1 returned no places")

        # fallback to legacy Nearby Search if v1 didn't return a usable station
        legacy_url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
        legacy_params = {
            "location": f"{lat},{lng}",
            "radius": int(os.environ.get("PLACES_RADIUS", "2000")),
            "type": "train_station",
            "key": API_KEY,
        }
        try:
            r_legacy = requests.get(legacy_url, params=legacy_params, timeout=10)
        except Exception as e:
            print(f"  [WARN] Legacy Places request failed: {e}")
            r_legacy = None

        if r_legacy is None or r_legacy.status_code != 200:
            if r_legacy is not None:
                try:
                    print("  [WARN] Legacy Places returned:", r_legacy.status_code, r_legacy.text[:300])
                except Exception:
                    pass
            return None

        try:
            legacy_data = r_legacy.json()
        except Exception:
            return None

        results = legacy_data.get("results", [])
        for r in results:
            types = r.get("types", [])
            if "train_station" not in types:
                continue
            if "bus_station" in types:
                continue
            name = r.get("name") or r.get("vicinity")
            loc = r.get("geometry", {}).get("location", {})
            plat = loc.get("lat")
            plng = loc.get("lng")
            if plat is None or plng is None:
                continue

            dest = f"{plat},{plng}"
            now_ts = int(datetime.datetime.now().timestamp())
            try:
                r2 = requests.get(build_directions_url(f"{lat},{lng}", dest, now_ts, mode="walking"), timeout=10)
            except Exception:
                continue
            if r2.status_code != 200:
                continue
            d2 = r2.json()
            if d2.get("status") != "OK":
                continue
            routes = d2.get("routes", [])
            if not routes:
                continue
            legs = routes[0].get("legs", [])
            if not legs:
                continue
            leg = legs[0]
            walking_seconds = leg.get("duration", {}).get("value")
            walking_distance = leg.get("distance", {}).get("value")
            return {
                "name": name,
                "walking_seconds": int(walking_seconds) if walking_seconds is not None else None,
                "walking_distance_m": int(walking_distance) if walking_distance is not None else None,
            }
    except Exception as e:
        print("  [WARN] find_nearest_transit_station failed:", e)
        return None



def safe_filename(id_str):
    return f"{id_str}.json"


def load_commute_config():
    # ensure commute dir exists
    try:
        os.makedirs(COMMUTE_DIR, exist_ok=True)
    except Exception:
        pass

    if os.path.isfile(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf8') as f:
                cfg = json.load(f)
                # expect top-level key 'commutes' as a list
                return cfg
        except Exception as e:
            print(f"[WARN] Failed to load commute config {CONFIG_PATH}: {e}")

    # fallback default config
    default = {
        "commutes": [
            {
                "name": "Work",
                "address": "10 Castlereagh St, Sydney NSW 2000",
                "mode": "transit",
                "day": "weekday",
                "time": "09:00"
            }
        ]
    }
    # write default config for user convenience
    try:
        with open(CONFIG_PATH, 'w', encoding='utf8') as f:
            json.dump(default, f, indent=2, ensure_ascii=False)
        print(f"[INFO] Wrote default commute config to {CONFIG_PATH}")
    except Exception:
        pass
    return default


def next_day_at_time(day_type: str, time_str: str):
    tz = ZoneInfo(TIMEZONE)
    now = datetime.datetime.now(tz)
    # parse time_str like '09:00'
    try:
        hh, mm = [int(x) for x in time_str.split(':')]
    except Exception:
        hh, mm = 9, 0

    # start from tomorrow to avoid returning a past time today
    candidate = (now + datetime.timedelta(days=1)).replace(hour=hh, minute=mm, second=0, microsecond=0)

    if day_type == 'weekday':
        # advance until Mon-Fri
        while candidate.weekday() >= 5:
            candidate += datetime.timedelta(days=1)
            candidate = candidate.replace(hour=hh, minute=mm, second=0, microsecond=0)
    elif day_type == 'weekend':
        # advance until Saturday (5) or Sunday (6); choose next Saturday
        while candidate.weekday() != 5:
            candidate += datetime.timedelta(days=1)
            candidate = candidate.replace(hour=hh, minute=mm, second=0, microsecond=0)
    else:
        # 'any' or unspecified -> just next day at time
        pass

    return int(candidate.timestamp())


def process_listings():
    # Build list of CSV rows (fresh file each run)
    csv_rows = []

    # Make sure listings dir exists
    if not os.path.isdir(LISTINGS_DIR):
        print(f"Listings directory '{LISTINGS_DIR}' not found")
        return

    # Iterate files
    files = sorted(os.listdir(LISTINGS_DIR))
    # load commute config (ensures COMMUTE_DIR exists)
    cfg = load_commute_config() or {}
    commutes = cfg.get("commutes", [])
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
        
        # Skip listings that already have travel time (commute/<id>.json)
        if has_travel_time(listing, listing_id):
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
        # For each commute definition in config, compute arrival timestamp and query Google
        per_listing_results = []
        for commute in commutes:
            name = commute.get("name") or commute.get("address")
            dest = commute.get("address")
            mode = commute.get("mode") or "transit"
            day = commute.get("day") or "any"
            time_str = commute.get("time") or "09:00"

            arrival_ts = next_day_at_time(day, time_str)
            travel = get_travel_time_for_origin(origin_normalised, dest, arrival_ts, mode=mode)
            if not travel:
                print(f"  [WARN] No result for commute '{name}' for {listing_id}")
                per_listing_results.append({
                    "name": name,
                    "destination": dest,
                    "mode": mode,
                    "arrival_timestamp": arrival_ts,
                    "result": None,
                })
                continue

            per_listing_results.append({
                "name": name,
                "destination": dest,
                "mode": mode,
                "arrival_timestamp": arrival_ts,
                "result": travel,
            })

        # Compute a single nearest station for the property (not per-commute)
        listing_nearest_station = None
        # Prefer any nearest_station returned by a commute result
        for item in per_listing_results:
            res = item.get('result')
            if res:
                ns = res.get('nearest_station')
                if ns:
                    listing_nearest_station = ns
                    break

        # If none found, attempt to derive from first successful commute's raw_response
        if listing_nearest_station is None:
            for item in per_listing_results:
                res = item.get('result')
                if not res:
                    continue
                try:
                    raw = res.get('raw_response') or {}
                    routes = raw.get('routes', [])
                    if not routes:
                        continue
                    first_leg = routes[0].get('legs', [])[0]
                    origin_loc = first_leg.get('start_location') or {}
                    lat = origin_loc.get('lat')
                    lng = origin_loc.get('lng')
                    if lat and lng:
                        ns = find_nearest_transit_station(lat, lng)
                        if ns:
                            listing_nearest_station = ns
                            break
                except Exception:
                    continue

        # Remove per-commute nearest_station to avoid duplicates (we'll expose a single top-level one)
        for item in per_listing_results:
            if item.get('result') and item['result'].get('nearest_station'):
                try:
                    item['result']['nearest_station'] = None
                except Exception:
                    pass

        # Ensure commute dir exists and write per-listing JSON
        try:
            os.makedirs(COMMUTE_DIR, exist_ok=True)
        except Exception:
            pass

        outpath = os.path.join(COMMUTE_DIR, safe_filename(listing_id))
        outobj = {
            "id": listing_id,
            "address": origin_normalised,
            "queried_at": datetime.datetime.now(ZoneInfo(TIMEZONE)).isoformat(),
            "commutes": per_listing_results,
            "nearest_station": listing_nearest_station,
        }
        try:
            with open(outpath, "w", encoding="utf8") as f:
                json.dump(outobj, f, indent=2, ensure_ascii=False)
            print(f"  [OK] Wrote commute results to {outpath}")
        except Exception as e:
            print(f"  [ERROR] Failed to write commute file {outpath}: {e}")

        # For backward compatibility, update listing with first successful commute (if any)
        first_success = None
        for item in per_listing_results:
            if item.get("result"):
                first_success = item
                break

        if first_success:
            travel = first_success["result"]
            dest = first_success.get("destination")
            listing["travel_duration_text"] = travel["summary"]["duration_text"]
            listing["travel_duration_seconds"] = travel["summary"]["duration_seconds"]
            listing["travel_arrival_timestamp"] = travel["arrival_timestamp"]
            listing["google_maps_url"] = build_google_maps_link(origin_normalised, dest)

            listing["google_transit"] = {
                "queried_at": datetime.datetime.now(ZoneInfo(TIMEZONE)).isoformat(),
                "arrival_timestamp": travel["arrival_timestamp"],
                "request": {
                    "origin": origin_normalised,
                    "destination": dest,
                    "mode": first_success.get("mode", "transit"),
                },
                "response": travel["raw_response"]
            }

            try:
                with open(path, "w", encoding="utf8") as f:
                    json.dump(listing, f, indent=2, ensure_ascii=False)
                print(f"  [OK] Updated {filename}")
            except Exception as e:
                print(f"  [ERROR] Failed to write {filename}: {e}")

            # Append CSV row using first_success
            csv_rows.append({
                "id": listing_id,
                "address": origin_normalised,
                "travel_duration_text": travel["summary"]["duration_text"],
                "travel_duration_seconds": travel["summary"]["duration_seconds"],
                "google_maps_url": listing.get("google_maps_url"),
            })
        else:
            # no successful commute results
            csv_rows.append({
                "id": listing_id,
                "address": origin_normalised,
                "travel_duration_text": None,
                "travel_duration_seconds": None,
                "google_maps_url": None
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

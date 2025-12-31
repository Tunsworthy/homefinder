from curl_cffi import requests
from bs4 import BeautifulSoup
import re
import json
from datetime import datetime
import time
import os

BASE_URL = (
    "https://www.domain.com.au/sale/?suburb="
    "cheltenham-nsw-2119,"
    "epping-nsw-2121,"
    "north-epping-nsw-2121,"
    "eastwood-nsw-2122,"
    "marsfield-nsw-2122,"
    "denistone-nsw-2114,"
    "north-ryde-nsw-2113,"
    "ryde-nsw-2112,"
    "bexley-nsw-2207,"
    "hurstville-nsw-2220,"
    "earlwood-nsw-2206,"
    "kingsgrove-nsw-2208,"
    "rockdale-nsw-2216,"
    "bexley-north-nsw-2207,"
    "roselands-nsw-2196,"
    "como-nsw-2226,"
    "belmore-nsw-2192,"
    "canterbury-nsw-2193,"
    "peakhurst-heights-nsw-2210,"
    "blakehurst-nsw-2221,"
    "carlingford-nsw-2118,"
    "telopea-nsw-2117,"
    "west-ryde-nsw-2114,"
    "meadowbank-nsw-2114,"
    "macquarie-park-nsw-2113,"
    "pennant-hills-nsw-2120,"
    "beecroft-nsw-2119,"
    "gladesville-nsw-2111,"
    "kogarah-nsw-2217,"
    "kogarah-bay-nsw-2217,"
    "allawah-nsw-2218,"
    "penshurst-nsw-2222,"
    "mortdale-nsw-2223,"
    "riverwood-nsw-2210,"
    "campsie-nsw-2194,"
    "lakemba-nsw-2195,"
    "punchbowl-nsw-2196,"
    "narwee-nsw-2209,"
    "turrella-nsw-2205,"
    "bardwell-park-nsw-2207,"
    "bardwell-valley-nsw-2207,"
    "hunters-hill-nsw-2110,"
    "wollstonecraft-nsw-2065,"
    "lane-cove-nsw-2066,"
    "oatley-nsw-2223,"
    "sans-souci-nsw-2219,"
    "killara-nsw-2071,"
    "roseville-nsw-2069,"
    "gordon-nsw-2072"
    "&ptype=free-standing&bedrooms=4-any&price=0-2750000&excludeunderoffer=1"
)

DATA_DIR = os.environ.get("DATA_DIR", ".")
OUTPUT_FILE = os.path.join(DATA_DIR, "listing_ids.json")
TODAY = datetime.now().strftime("%Y-%m-%d")


# ---------- persistence ----------

def load_saved_ids():
    try:
        with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)

            # OLD FORMAT: list of IDs
            if isinstance(data, list):
                print("⚠ Detected legacy ID list — migrating format")
                today = datetime.now().strftime("%Y-%m-%d")
                return {
                    id_: {
                        "id": id_,
                        "added_date": today,
                        "updated_date": today,
                        "status": "missing"
                    }
                    for id_ in data
                }

            # NEW FORMAT: dict
            if isinstance(data, dict):
                return data

            print("⚠ Unknown JSON format — starting fresh")
            return {}

    except FileNotFoundError:
        return {}


def save_ids(data):
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# ---------- scraping ----------

def fetch_page(page_num):
    url = BASE_URL + f"&page={page_num}"

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }

    r = requests.get(url, headers=headers, impersonate="chrome")
    r.raise_for_status()
    return r.text


def extract_ids_from_html(html):
    soup = BeautifulSoup(html, "html.parser")
    pattern = re.compile(r"-([0-9]{10})")
    ids = set()

    for link in soup.find_all("a", href=True):
        match = pattern.search(link["href"])
        if match:
            ids.add(match.group(1))

    return ids


def fetch_all_listing_ids():
    all_ids = set()
    page = 1

    while True:
        print(f"Fetching page {page}...")
        html = fetch_page(page)
        ids = extract_ids_from_html(html)

        print(f" → Found {len(ids)} IDs")

        if not ids:
            break

        if ids.issubset(all_ids):
            print("Page repeated — stopping.")
            break

        all_ids |= ids
        page += 1
        time.sleep(0.3)

    return all_ids


# ---------- main ----------

if __name__ == "__main__":
    print("Fetching latest listings:", TODAY)

    existing = load_saved_ids()
    current_ids = fetch_all_listing_ids()

    # Mark all existing IDs as missing by default
    for id_, record in existing.items():
        record["status"] = "missing"
        record["updated_date"] = TODAY

    # Process current IDs
    for listing_id in current_ids:
        if listing_id in existing:
            existing[listing_id]["status"] = "active"
            existing[listing_id]["updated_date"] = TODAY
        else:
            existing[listing_id] = {
                "id": listing_id,
                "added_date": TODAY,
                "updated_date": TODAY,
                "status": "active"
            }

    save_ids(existing)

    print(f"\n✔ Total IDs tracked: {len(existing)}")
    print(f"✔ Active: {sum(1 for v in existing.values() if v['status'] == 'active')}")
    print(f"✔ Missing: {sum(1 for v in existing.values() if v['status'] == 'missing')}")

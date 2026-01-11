from curl_cffi import requests, CurlOpt
from bs4 import BeautifulSoup
import json
import csv
import os
import time
import re

DATA_DIR = os.environ.get("DATA_DIR", ".")
LISTING_IDS_FILE = os.path.join(DATA_DIR, "listing_ids.json")
OUTPUT_FOLDER = os.path.join(DATA_DIR, "listings")
SUMMARY_CSV = os.path.join(DATA_DIR, "summary.csv")
SUBURBS_FILE = os.path.join(DATA_DIR, "suburbs.json")

BASE_URL = "https://www.domain.com.au/"


def load_listing_ids():
    with open(LISTING_IDS_FILE, "r") as f:
        return json.load(f)


def load_suburbs():
    """Load existing suburbs list or return empty set"""
    if os.path.exists(SUBURBS_FILE):
        with open(SUBURBS_FILE, "r", encoding="utf-8") as f:
            return set(json.load(f))
    return set()


def save_suburbs(suburbs_set):
    """Save suburbs list sorted alphabetically"""
    with open(SUBURBS_FILE, "w", encoding="utf-8") as f:
        json.dump(sorted(list(suburbs_set)), f, indent=2, ensure_ascii=False)


def extract_suburb_from_address(address):
    """
    Extract suburb from address format: "Street Address, Suburb STATE Postcode"
    Returns suburb or None if cannot parse
    """
    if not address:
        return None
    
    parts = address.split(',')
    if len(parts) < 2:
        return None
    
    # Get the part after the first comma
    after_comma = parts[1].strip()
    
    # Remove STATE and postcode (e.g., "NSW 2208")
    # Pattern: space + 2-3 uppercase letters + space + 4 digits at end
    suburb = re.sub(r'\s+[A-Z]{2,3}\s+\d{4}$', '', after_comma).strip()
    
    return suburb if suburb else None


def extract_property_type(soup):
    el = soup.find("div", {"data-testid": "listing-summary-property-type"})
    if el:
        span = el.find("span")
        if span:
            return span.get_text(strip=True)
    return None


def extract_size(soup):
    size_el = soup.find("span", {"data-testid": "listing-details__property-size"})
    if size_el:
        return size_el.get_text(strip=True)

    size_el = soup.find("div", {"data-testid": "property-size"})
    if size_el:
        return size_el.get_text(strip=True)

    text = soup.get_text(" ", strip=True)
    match = re.search(r"(\d[\d,\.]*)\s*(m²|sqm|square metres|square meters)", text, re.IGNORECASE)
    if match:
        return match.group(0).replace("square metres", "m²")

    match = re.search(r"land size[^0-9]*([0-9,\.]+\s*m²)", text, re.IGNORECASE)
    if match:
        return match.group(1)

    return None


def extract_features(soup):
    features = {"bedrooms": None, "bathrooms": None, "parking": None}
    wrapper = soup.find("div", {"data-testid": "property-features-wrapper"})
    if not wrapper:
        return features

    for item in wrapper.find_all("span", {"data-testid": "property-features-feature"}):
        text_container = item.find("span", {"data-testid": "property-features-text-container"})
        if not text_container:
            continue

        label_span = text_container.find("span", {"data-testid": "property-features-text"})
        if not label_span:
            continue

        label = label_span.get_text(strip=True).lower()
        number = text_container.get_text(strip=True).replace(label_span.get_text(strip=True), "").strip()

        if "bed" in label:
            features["bedrooms"] = number
        elif "bath" in label:
            features["bathrooms"] = number
        elif "park" in label:
            features["parking"] = number

    return features


def fetch_listing_html(listing_id):
    url = BASE_URL + listing_id
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
    }

    r = requests.get(
    url,
    headers=headers,
    impersonate="chrome",
    timeout=10,
    curl_options={
        CurlOpt.IPRESOLVE: 1  # FORCE IPv4
    }
    )
    if r.status_code == 404:
        print(f"❌ Listing {listing_id} not found")
        return None

    r.raise_for_status()
    return r.text


def extract_text(soup, selector):
    el = soup.select_one(selector)
    return el.get_text(strip=True) if el else None


# ✅ NEW: sold detection helper
def extract_status_and_sold_price(price_text: str):
    if not price_text:
        return "unknown", None

    text = price_text.lower()

    if "sold" not in text:
        return "active", None

    price_match = re.search(r"\$[\d,.]+(?:m)?", text, re.IGNORECASE)
    sold_price = price_match.group(0) if price_match else None

    return "sold", sold_price


def parse_listing(html, listing_id):
    soup = BeautifulSoup(html, "html.parser")

    data = {"id": listing_id}

    data["address"] = extract_text(soup, "[data-testid='listing-details__button-copy-wrapper']")
    data["suburb"] = extract_suburb_from_address(data["address"])
    data["price"] = extract_text(soup, "[data-testid='listing-details__summary-title']")

    # ✅ NEW: status + sold price
    status, sold_price = extract_status_and_sold_price(data["price"])
    data["status"] = status
    data["sold_price"] = sold_price

    data["headline"] = extract_text(soup, "h1[data-testid='listing-details__headline']")

    desc_el = soup.select_one("[data-testid='listing-details__description']")
    data["description"] = desc_el.get_text("\n", strip=True) if desc_el else None

    features = extract_features(soup)
    data.update(features)

    data["property_type"] = extract_property_type(soup)
    data["property_size"] = extract_size(soup)

    data["agent_name"] = extract_text(soup, "[data-testid='listing-details__agent-name']")
    data["agent_phone"] = extract_text(soup, "[data-testid='listing-details__agent-phone']")

    images = []
    for img in soup.select("img[src]"):
        src = img.get("src")
        if "domainstatic" in src:
            images.append(src)

    data["image_urls"] = images
    data["url"] = BASE_URL + listing_id

    return data


def save_listing_json(listing_id, data):
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)
    path = os.path.join(OUTPUT_FOLDER, f"{listing_id}.json")
    
    # Load existing data if file exists
    existing_data = {}
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            existing_data = json.load(f)
    
    # Merge existing data with new data, preserving existing fields
    merged_data = existing_data.copy()
    merged_data.update(data)
    
    with open(path, "w", encoding="utf-8") as f:
        json.dump(merged_data, f, indent=2, ensure_ascii=False)


def main():
    ids = load_listing_ids()
    print(f"Found {len(ids)} IDs — scraping each listing…")

    suburbs = load_suburbs()
    summary_rows = []

    for listing_id in ids:
        print(f" → Fetching listing {listing_id}…")
        html = fetch_listing_html(listing_id)
        if not html:
            continue

        data = parse_listing(html, listing_id)
        save_listing_json(listing_id, data)

        # Track suburb if found
        if data.get("suburb"):
            suburbs.add(data["suburb"])

        summary_rows.append({
            "id": listing_id,
            "url": data["url"],
            "address": data.get("address"),
            "suburb": data.get("suburb"),
            "status": data.get("status"),
            "price": data.get("price"),
            "sold_price": data.get("sold_price"),
            "bedrooms": data.get("bedrooms"),
            "bathrooms": data.get("bathrooms"),
            "parking": data.get("parking"),
        })

        time.sleep(0.4)

    # Save suburbs list
    save_suburbs(suburbs)
    
    print("\n🎉 Done!")
    print(f"📁 Listing JSON stored in: {OUTPUT_FOLDER}/")
    print(f"📍 Found {len(suburbs)} unique suburbs → {SUBURBS_FILE}")


if __name__ == "__main__":
    main()

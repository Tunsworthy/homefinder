"""
Backfill script to add suburb field to existing listing JSONs
"""
import json
import os
import re
from pathlib import Path

DATA_DIR = os.environ.get("DATA_DIR", ".")
LISTINGS_FOLDER = os.path.join(DATA_DIR, "listings")
SUBURBS_FILE = os.path.join(DATA_DIR, "suburbs.json")


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


def main():
    listings_path = Path(LISTINGS_FOLDER)
    
    if not listings_path.exists():
        print(f"❌ Listings folder not found: {LISTINGS_FOLDER}")
        return
    
    json_files = list(listings_path.glob("*.json"))
    print(f"Found {len(json_files)} listing JSON files")
    
    suburbs = set()
    updated_count = 0
    
    for json_file in json_files:
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Skip if suburb already exists
            if data.get('suburb'):
                suburbs.add(data['suburb'])
                continue
            
            # Extract suburb from address
            address = data.get('address')
            suburb = extract_suburb_from_address(address)
            
            if suburb:
                data['suburb'] = suburb
                suburbs.add(suburb)
                
                # Save updated JSON
                with open(json_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                
                updated_count += 1
                print(f"✓ {json_file.name}: {suburb}")
            else:
                print(f"⚠ {json_file.name}: Could not extract suburb from '{address}'")
                
        except Exception as e:
            print(f"❌ Error processing {json_file.name}: {e}")
    
    # Save suburbs.json
    with open(SUBURBS_FILE, 'w', encoding='utf-8') as f:
        json.dump(sorted(list(suburbs)), f, indent=2, ensure_ascii=False)
    
    print(f"\n🎉 Complete!")
    print(f"   Updated: {updated_count} listings")
    print(f"   Found: {len(suburbs)} unique suburbs")
    print(f"   Saved to: {SUBURBS_FILE}")


if __name__ == "__main__":
    main()

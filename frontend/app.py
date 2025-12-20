from flask import Flask, jsonify, render_template, send_from_directory, abort
import os
import json
from pathlib import Path
from flask import request

app = Flask(__name__, static_folder='static')

DATA_DIR = Path(os.environ.get('DATA_DIR', '/data'))
LISTINGS_DIR = DATA_DIR / 'listings'
LISTING_IDS_FILE = DATA_DIR / 'listing_ids.json'
VOTES_FILE = DATA_DIR / 'votes.json'

PAGE_SIZE = 20


def load_listing_json(path: Path):
    try:
        with path.open('r', encoding='utf8') as f:
            return json.load(f)
    except Exception:
        return None


def load_votes():
    try:
        with VOTES_FILE.open('r', encoding='utf8') as f:
            return json.load(f)
    except Exception:
        return {}


def save_votes(votes: dict):
    try:
        VOTES_FILE.parent.mkdir(parents=True, exist_ok=True)
        with VOTES_FILE.open('w', encoding='utf8') as f:
            json.dump(votes, f, indent=2)
    except Exception:
        pass


def extract_route_summary_from_listing(data: dict):
    # Try to extract google transit response from listing
    try:
        g = data.get('google_transit') or {}
        resp = g.get('response') or g.get('raw_response')
        if not resp:
            return None
        steps = resp['routes'][0]['legs'][0]['steps']
        parts = []
        for step in steps:
            mode = step.get('travel_mode')
            if mode == 'WALKING':
                dur = step.get('duration', {}).get('text')
                parts.append(f"Walk{(' ' + dur) if dur else ''}")
            elif mode == 'TRANSIT':
                td = step.get('transit_details', {})
                line = td.get('line', {})
                vehicle = (line.get('vehicle') or {}).get('type')
                name = line.get('short_name') or line.get('name')
                dur = step.get('duration', {}).get('text')
                label = vehicle.title() if vehicle else 'Transit'
                if name:
                    label = f"{label} ({name})"
                if dur:
                    label = f"{label} {dur}"
                parts.append(label)
            else:
                dur = step.get('duration', {}).get('text')
                parts.append(f"{(mode.title() if mode else 'Step')}{(' ' + dur) if dur else ''}")
        # compress consecutive identical parts
        compressed = []
        for p in parts:
            if not compressed or compressed[-1] != p:
                compressed.append(p)
        return ' → '.join(compressed)
    except Exception:
        return None


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/listing/<listing_id>')
def listing_page(listing_id):
    return render_template('listing.html', listing_id=listing_id)


@app.route('/api/listings')
def api_listings():
    """Return a paginated list of listings. Query params: offset, limit, status=all|available|sold, sort=travel|none"""
    try:
        offset = int(request.args.get('offset', 0))
        limit = int(request.args.get('limit', PAGE_SIZE))
    except ValueError:
        return jsonify({'error': 'invalid params'}), 400

    status_filter = request.args.get('status', 'all')  # all, available, sold
    sort = request.args.get('sort', 'none')  # travel or none

    summaries = []
    if not LISTINGS_DIR.is_dir():
        return jsonify({'listings': [], 'offset': offset, 'limit': limit, 'total': 0, 'available': 0, 'sold': 0})

    files = sorted([p for p in LISTINGS_DIR.iterdir() if p.suffix.lower() == '.json'])
    for p in files:
        data = load_listing_json(p)
        if not data:
            continue
        # attach votes if present
        votes = load_votes()
        v = votes.get(str(data.get('id') or p.stem), {})
        tom_vote = v.get('tom')
        mq_vote = v.get('mq')
        # route summary
        route_summary = extract_route_summary_from_listing(data)
        # pick first non-agent image (exclude urls containing 'contact')
        img = None
        for u in (data.get('image_urls') or []):
            if not u:
                continue
            if 'contact' in u.lower():
                continue
            if 'logo' in u.lower():
                continue
            img = u
            break
        # fallback to first image if none matched
        if not img:
            img = (data.get('image_urls') or [None])[0]
        summaries.append({
            'id': data.get('id') or p.stem,
            'address': data.get('address'),
            'bedrooms': data.get('bedrooms'),
            'bathrooms': data.get('bathrooms'),
            'price': data.get('price'),
            'travel_duration_text': data.get('travel_duration_text'),
            'travel_duration_seconds': data.get('travel_duration_seconds'),
            'status': data.get('status') or 'unknown',
            'image': img,
            'url': data.get('url'),
            'google_maps_url': data.get('google_maps_url'),
            'tom': tom_vote,
            'mq': mq_vote,
            'route_summary': route_summary,
        })

    total = len(summaries)
    sold_count = sum(1 for s in summaries if str(s.get('status')).lower() == 'sold')
    available_count = total - sold_count

    # apply status filter
    if status_filter == 'sold':
        summaries = [s for s in summaries if str(s.get('status')).lower() == 'sold']
    elif status_filter == 'available':
        summaries = [s for s in summaries if str(s.get('status')).lower() != 'sold']

    # apply Tom/MQ filters
    tom_filter = request.args.get('tom', 'any')  # any, yes, no
    mq_filter = request.args.get('mq', 'any')
    if tom_filter in ('yes', 'no'):
        wanted = tom_filter == 'yes'
        summaries = [s for s in summaries if (s.get('tom') is True) == wanted]
    if mq_filter in ('yes', 'no'):
        wanted = mq_filter == 'yes'
        summaries = [s for s in summaries if (s.get('mq') is True) == wanted]

    # apply sorting
    if sort == 'travel':
        # None travel times should be placed at end
        summaries.sort(key=lambda s: (s.get('travel_duration_seconds') is None, s.get('travel_duration_seconds') or 0))

    # pagination
    selected = summaries[offset: offset + limit]

    return jsonify({
        'listings': selected,
        'offset': offset,
        'limit': limit,
        'total': total,
        'available': available_count,
        'sold': sold_count,
    })


@app.route('/api/listing/<listing_id>')
def api_listing(listing_id):
    # look for file in LISTINGS_DIR
    path = LISTINGS_DIR / f"{listing_id}.json"
    if not path.exists():
        # maybe the id is stored inside files: search
        if LISTINGS_DIR.is_dir():
            for p in LISTINGS_DIR.iterdir():
                if p.suffix.lower() != '.json':
                    continue
                data = load_listing_json(p)
                if not data:
                    continue
                if str(data.get('id')) == listing_id:
                    return jsonify(data)
        return jsonify({'error': 'not found'}), 404

    data = load_listing_json(path)
    if not data:
        return jsonify({'error': 'failed to read'}), 500
    # attach votes
    votes = load_votes()
    v = votes.get(str(data.get('id') or path.stem), {})
    data['tom'] = v.get('tom')
    data['mq'] = v.get('mq')
    # route summary
    data['route_summary'] = extract_route_summary_from_listing(data)
    # pick non-agent image
    img = None
    for u in (data.get('image_urls') or []):
        if not u:
            continue
        if 'contact' in u.lower():
            continue
        img = u
        break
    if not img:
        img = (data.get('image_urls') or [None])[0]
    data['image'] = img
    data['google_maps_url'] = data.get('google_maps_url')
    return jsonify(data)


@app.route('/api/listing/<listing_id>/vote', methods=['POST'])
def api_vote(listing_id):
    payload = request.get_json() or {}
    tom = payload.get('tom') if 'tom' in payload else None
    mq = payload.get('mq') if 'mq' in payload else None

    votes = load_votes()
    key = str(listing_id)
    v = votes.get(key, {})
    if tom is not None:
        # accept true/false/null
        v['tom'] = True if tom is True else (False if tom is False else None)
    if mq is not None:
        v['mq'] = True if mq is True else (False if mq is False else None)
    votes[key] = v
    save_votes(votes)
    return jsonify({'ok': True, 'tom': v.get('tom'), 'mq': v.get('mq')})


@app.route('/static/<path:path>')
def static_proxy(path):
    return send_from_directory('static', path)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)

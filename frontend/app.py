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
        # include latest comments (if any)
        comments = v.get('comments', []) if isinstance(v, dict) else []
        # sort comments by ts desc
        comments_sorted = sorted(comments, key=lambda c: c.get('ts', 0), reverse=True)
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
            'tom_comment': v.get('tom_comment'),
            'mq_comment': v.get('mq_comment'),
            'route_summary': route_summary,
            'comments': comments_sorted[:3],
        })

    total = len(summaries)
    sold_count = sum(1 for s in summaries if str(s.get('status')).lower() == 'sold')
    available_count = total - sold_count

    # apply status filter
    if status_filter == 'sold':
        summaries = [s for s in summaries if str(s.get('status')).lower() == 'sold']
    elif status_filter == 'available':
        summaries = [s for s in summaries if str(s.get('status')).lower() != 'sold']

    # apply Tom/MQ filters (tri-state: any, yes, no)
    tom_filter = request.args.get('tom', 'any')  # any, yes, no
    mq_filter = request.args.get('mq', 'any')
    if tom_filter == 'yes':
        summaries = [s for s in summaries if s.get('tom') is True]
    elif tom_filter == 'no':
        summaries = [s for s in summaries if s.get('tom') is False]
    if mq_filter == 'yes':
        summaries = [s for s in summaries if s.get('mq') is True]
    elif mq_filter == 'no':
        summaries = [s for s in summaries if s.get('mq') is False]

    # optionally exclude any listings that have any vote
    exclude_voted = request.args.get('exclude_voted', 'false').lower() in ('1', 'true', 'yes')
    if exclude_voted:
        summaries = [s for s in summaries if s.get('tom') is None and s.get('mq') is None]

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
    data['tom_comment'] = v.get('tom_comment')
    data['mq_comment'] = v.get('mq_comment')
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
    # include full comments list sorted newest first
    comments = v.get('comments', []) if isinstance(v, dict) else []
    data['comments'] = sorted(comments, key=lambda c: c.get('ts', 0), reverse=True)
    return jsonify(data)


@app.route('/api/listing/<listing_id>/vote', methods=['POST'])
def api_vote(listing_id):
    payload = request.get_json() or {}
    tom = payload.get('tom') if 'tom' in payload else None
    mq = payload.get('mq') if 'mq' in payload else None
    tom_comment = payload.get('tom_comment') if 'tom_comment' in payload else None
    mq_comment = payload.get('mq_comment') if 'mq_comment' in payload else None

    votes = load_votes()
    key = str(listing_id)
    v = votes.get(key, {})
    if tom is not None:
        # accept true/false/null
        v['tom'] = True if tom is True else (False if tom is False else None)
    if mq is not None:
        v['mq'] = True if mq is True else (False if mq is False else None)
    if tom_comment is not None:
        v['tom_comment'] = tom_comment
    if mq_comment is not None:
        v['mq_comment'] = mq_comment
    votes[key] = v
    save_votes(votes)
    return jsonify({'ok': True, 'tom': v.get('tom'), 'mq': v.get('mq')})


@app.route('/api/listing/<listing_id>/comment', methods=['POST'])
def api_comment_create(listing_id):
    payload = request.get_json() or {}
    person = payload.get('person')
    text = payload.get('text')
    if person not in ('tom', 'mq') or not isinstance(text, str) or text.strip() == '':
        return jsonify({'error': 'invalid'}), 400

    votes = load_votes()
    key = str(listing_id)
    v = votes.get(key, {})
    comments = v.get('comments', [])
    # comment id use timestamp-ms
    import time
    cid = str(int(time.time() * 1000))
    comment = {'id': cid, 'person': person, 'text': text.strip(), 'ts': int(time.time())}
    comments.append(comment)
    v['comments'] = comments
    votes[key] = v
    save_votes(votes)
    return jsonify({'ok': True, 'comment': comment})


@app.route('/api/listing/<listing_id>/comment/<comment_id>', methods=['PUT'])
def api_comment_update(listing_id, comment_id):
    payload = request.get_json() or {}
    text = payload.get('text')
    if not isinstance(text, str):
        return jsonify({'error': 'invalid'}), 400

    votes = load_votes()
    key = str(listing_id)
    v = votes.get(key, {})
    comments = v.get('comments', [])
    found = False
    for c in comments:
        if str(c.get('id')) == str(comment_id):
            c['text'] = text.strip()
            c['edited_ts'] = int(__import__('time').time())
            found = True
            break
    if not found:
        return jsonify({'error': 'not found'}), 404
    v['comments'] = comments
    votes[key] = v
    save_votes(votes)
    return jsonify({'ok': True})


@app.route('/api/listing/<listing_id>/comment/<comment_id>', methods=['DELETE'])
def api_comment_delete(listing_id, comment_id):
    votes = load_votes()
    key = str(listing_id)
    v = votes.get(key, {})
    comments = v.get('comments', [])
    new_comments = [c for c in comments if str(c.get('id')) != str(comment_id)]
    if len(new_comments) == len(comments):
        return jsonify({'error': 'not found'}), 404
    v['comments'] = new_comments
    votes[key] = v
    save_votes(votes)
    return jsonify({'ok': True})


@app.route('/static/<path:path>')
def static_proxy(path):
    return send_from_directory('static', path)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)

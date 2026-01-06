"""Import existing JSON data into Postgres database.

This script migrates:
- Listings from backend/listings/*.json
- Votes from backend/votes.json (mapped to Tom/MQ users)
- Comments from listings (mapped to Tom/MQ users)
- Commute data from backend/commute/*.json
"""
import sys
import json
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from api.database import SessionLocal, engine, Base
from api.models import User, Listing, Vote, Comment, Commute
from api.config import DATA_DIR


def load_json_file(filepath):
    """Load JSON file safely."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"  ✗ Error loading {filepath}: {e}")
        return None


def get_user_by_username(db, username):
    """Get user by username."""
    return db.query(User).filter(User.username == username.lower()).first()


def import_listings(db, listings_dir):
    """Import all listings from JSON files."""
    print("\n📦 Importing listings...")
    
    listings_path = Path(listings_dir)
    if not listings_path.exists():
        print(f"  ✗ Listings directory not found: {listings_dir}")
        return {}
    
    json_files = list(listings_path.glob('*.json'))
    print(f"  Found {len(json_files)} listing files")
    
    listing_map = {}  # external_id -> Listing object
    imported_count = 0
    skipped_count = 0
    
    for json_file in json_files:
        data = load_json_file(json_file)
        if not data:
            continue
        
        external_id = json_file.stem  # filename without extension
        
        # Check if listing already exists
        existing = db.query(Listing).filter(Listing.external_id == external_id).first()
        if existing:
            listing_map[external_id] = existing
            skipped_count += 1
            continue
        
        # Create new listing
        listing = Listing(
            external_id=external_id,
            address=data.get('address'),
            price=data.get('price'),
            bedrooms=data.get('bedrooms'),
            bathrooms=data.get('bathrooms'),
            property_type=data.get('property_type'),
            url=data.get('url'),
            image=data.get('image'),
            images=data.get('images', []),
            status=data.get('status', 'available'),
            raw_data=data
        )
        
        db.add(listing)
        listing_map[external_id] = listing
        imported_count += 1
    
    db.commit()
    print(f"  ✓ Imported {imported_count} new listings, skipped {skipped_count} existing")
    return listing_map


def import_votes(db, votes_file, listing_map):
    """Import votes from votes.json."""
    print("\n🗳️  Importing votes...")
    
    votes_path = Path(votes_file)
    if not votes_path.exists():
        print(f"  ⚠ Votes file not found: {votes_file}")
        return
    
    votes_data = load_json_file(votes_path)
    if not votes_data:
        return
    
    # Get Tom and MQ users
    tom = get_user_by_username(db, 'tom')
    mq = get_user_by_username(db, 'mq')
    
    if not tom or not mq:
        print("  ✗ Error: Tom or MQ user not found. Run seed_users.py first!")
        return
    
    imported_count = 0
    skipped_count = 0
    
    for external_id, vote_data in votes_data.items():
        listing = listing_map.get(external_id)
        if not listing:
            continue
        
        # Import Tom's vote
        if 'tom' in vote_data or 'tom_score' in vote_data:
            existing_vote = db.query(Vote).filter(
                Vote.listing_id == listing.id,
                Vote.user_id == tom.id
            ).first()
            
            if not existing_vote:
                tom_vote = Vote(
                    listing_id=listing.id,
                    user_id=tom.id,
                    value=vote_data.get('tom'),
                    score=vote_data.get('tom_score')
                )
                db.add(tom_vote)
                imported_count += 1
            else:
                skipped_count += 1
        
        # Import MQ's vote
        if 'mq' in vote_data or 'mq_score' in vote_data:
            existing_vote = db.query(Vote).filter(
                Vote.listing_id == listing.id,
                Vote.user_id == mq.id
            ).first()
            
            if not existing_vote:
                mq_vote = Vote(
                    listing_id=listing.id,
                    user_id=mq.id,
                    value=vote_data.get('mq'),
                    score=vote_data.get('mq_score')
                )
                db.add(mq_vote)
                imported_count += 1
            else:
                skipped_count += 1
    
    db.commit()
    print(f"  ✓ Imported {imported_count} votes, skipped {skipped_count} existing")


def import_comments(db, listings_dir, listing_map):
    """Import comments from listing JSON files."""
    print("\n💬 Importing comments...")
    
    # Get Tom and MQ users
    tom = get_user_by_username(db, 'tom')
    mq = get_user_by_username(db, 'mq')
    
    if not tom or not mq:
        print("  ✗ Error: Tom or MQ user not found. Run seed_users.py first!")
        return
    
    user_map = {'tom': tom, 'mq': mq}
    
    imported_count = 0
    skipped_count = 0
    
    listings_path = Path(listings_dir)
    for json_file in listings_path.glob('*.json'):
        data = load_json_file(json_file)
        if not data or 'comments' not in data:
            continue
        
        external_id = json_file.stem
        listing = listing_map.get(external_id)
        if not listing:
            continue
        
        for comment_data in data['comments']:
            person = comment_data.get('person', '').lower()
            user = user_map.get(person)
            if not user:
                continue
            
            # Use comment ID if available to check for duplicates
            comment_id = comment_data.get('id')
            text = comment_data.get('text', '')
            ts = comment_data.get('ts')
            
            # Check if comment already exists (by text and user for now)
            existing = db.query(Comment).filter(
                Comment.listing_id == listing.id,
                Comment.user_id == user.id,
                Comment.text == text
            ).first()
            
            if existing:
                skipped_count += 1
                continue
            
            # Create timestamp
            created_at = datetime.fromtimestamp(ts) if ts else datetime.utcnow()
            
            comment = Comment(
                listing_id=listing.id,
                user_id=user.id,
                text=text,
                created_at=created_at
            )
            db.add(comment)
            imported_count += 1
    
    db.commit()
    print(f"  ✓ Imported {imported_count} comments, skipped {skipped_count} existing")


def import_commutes(db, commute_dir, listing_map):
    """Import commute data from commute/*.json files."""
    print("\n🚗 Importing commute data...")
    
    commute_path = Path(commute_dir)
    if not commute_path.exists():
        print(f"  ⚠ Commute directory not found: {commute_dir}")
        return
    
    imported_count = 0
    skipped_count = 0
    
    for json_file in commute_path.glob('*.json'):
        data = load_json_file(json_file)
        if not data:
            continue
        
        external_id = json_file.stem
        listing = listing_map.get(external_id)
        if not listing:
            continue
        
        # Check if commute already exists
        existing = db.query(Commute).filter(Commute.listing_id == listing.id).first()
        if existing:
            skipped_count += 1
            continue
        
        # Extract travel seconds from first commute if available
        travel_seconds = None
        commutes_data = data.get('commutes', [])
        if commutes_data:
            first_commute = commutes_data[0]
            result = first_commute.get('result', {})
            raw_response = result.get('raw_response', {})
            routes = raw_response.get('routes', [])
            if routes and routes[0].get('legs'):
                duration = routes[0]['legs'][0].get('duration', {})
                travel_seconds = duration.get('value')
        
        commute = Commute(
            listing_id=listing.id,
            commutes_data=commutes_data,
            nearest_station=data.get('nearest_station'),
            travel_seconds=travel_seconds
        )
        db.add(commute)
        imported_count += 1
    
    db.commit()
    print(f"  ✓ Imported {imported_count} commute records, skipped {skipped_count} existing")


def main():
    """Main import process."""
    print("=" * 60)
    print("JSON to Postgres Migration Script")
    print("=" * 60)
    
    # Create tables if they don't exist
    print("\n🔧 Ensuring database tables exist...")
    Base.metadata.create_all(bind=engine)
    print("  ✓ Tables ready")
    
    db = SessionLocal()
    try:
        # Check that Tom and MQ users exist
        tom = get_user_by_username(db, 'tom')
        mq = get_user_by_username(db, 'mq')
        
        if not tom or not mq:
            print("\n✗ ERROR: Tom and/or MQ users not found!")
            print("  Please run: python api/scripts/seed_users.py")
            return
        
        print(f"\n✓ Found users: Tom (id={tom.id}), MQ (id={mq.id})")
        
        # Import data
        listings_dir = DATA_DIR / 'listings'
        votes_file = DATA_DIR / 'votes.json'
        commute_dir = DATA_DIR / 'commute'
        
        listing_map = import_listings(db, listings_dir)
        import_votes(db, votes_file, listing_map)
        import_comments(db, listings_dir, listing_map)
        import_commutes(db, commute_dir, listing_map)
        
        print("\n" + "=" * 60)
        print("✅ Migration complete!")
        print("=" * 60)
        
        # Print summary
        total_listings = db.query(Listing).count()
        total_votes = db.query(Vote).count()
        total_comments = db.query(Comment).count()
        total_commutes = db.query(Commute).count()
        
        print(f"\n📊 Database Summary:")
        print(f"  • Listings: {total_listings}")
        print(f"  • Votes: {total_votes}")
        print(f"  • Comments: {total_comments}")
        print(f"  • Commutes: {total_commutes}")
        print(f"  • Users: 2 (Tom, MQ)")
        
    except Exception as e:
        db.rollback()
        print(f"\n✗ Error during migration: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == '__main__':
    main()

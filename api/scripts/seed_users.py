"""Seed initial users (Tom and MQ) for the housefinder application."""
import sys
from pathlib import Path

# Add parent directory to path so we can import api module
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from api.database import SessionLocal, engine, Base
from api.models import User
from api.auth import hash_password


def seed_users():
    """Create Tom and MQ user accounts."""
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # Check if users already exist
        existing_tom = db.query(User).filter(User.username == 'tom').first()
        existing_mq = db.query(User).filter(User.username == 'mq').first()
        
        if existing_tom and existing_mq:
            print("✓ Users 'tom' and 'mq' already exist. Skipping seed.")
            return
        
        # Create Tom
        if not existing_tom:
            tom = User(
                username='tom',
                email='tom@housefinder.local',
                password_hash=hash_password('tom123'),  # Change this password!
                role='user'
            )
            db.add(tom)
            print("✓ Created user 'tom' (email: tom@housefinder.local, password: tom123)")
        
        # Create MQ
        if not existing_mq:
            mq = User(
                username='mq',
                email='mq@housefinder.local',
                password_hash=hash_password('mq123'),  # Change this password!
                role='user'
            )
            db.add(mq)
            print("✓ Created user 'mq' (email: mq@housefinder.local, password: mq123)")
        
        db.commit()
        print("\n✓ User seeding complete!")
        print("\nIMPORTANT: Change these default passwords in production!")
        
    except Exception as e:
        db.rollback()
        print(f"✗ Error seeding users: {e}")
        raise
    finally:
        db.close()


if __name__ == '__main__':
    print("Seeding users...")
    seed_users()

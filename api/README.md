# Housefinder API - Database & Authentication

This directory contains the persistent API layer for the housefinder application, including database models, authentication, and migration scripts.

## Setup

### 1. Install Dependencies

```bash
cd api
pip install -r requirements.txt
```

### 2. Start Postgres (Docker)

From the `domain/` directory:

```bash
docker-compose up -d
```

This starts a Postgres container on `localhost:5432` with:
- Database: `housefinder`
- User: `housefinder`
- Password: `housefinder`

### 3. Set Environment Variables (Optional)

Create a `.env` file in the `api/` directory:

```env
DATABASE_URL=postgresql://housefinder:housefinder@localhost:5432/housefinder
SECRET_KEY=your-secret-key-here-change-in-production
```

### 4. Create Database Tables

Using Alembic (recommended):

```bash
cd api
alembic upgrade head
```

Or directly via SQLAlchemy (for development):

```python
python -c "from api.database import init_db; init_db()"
```

### 5. Seed Users

Create Tom and MQ user accounts:

```bash
python api/scripts/seed_users.py
```

Default credentials:
- **Tom**: username=`tom`, password=`tom123`
- **MQ**: username=`mq`, password=`mq123`

⚠️ **Change these passwords in production!**

### 6. Import Existing Data

Migrate listings, votes, comments, and commutes from JSON files:

```bash
python api/scripts/import_json_to_pg.py
```

This imports:
- `backend/listings/*.json` → `listings` table
- `backend/votes.json` → `votes` table (linked to Tom/MQ)
- Comments from listing JSONs → `comments` table
- `backend/commute/*.json` → `commutes` table

## Database Schema

### Tables

**users**
- User accounts with password hashing (Argon2)
- Used for authentication and linking votes/comments

**listings**
- Property listings with address, price, beds, baths, etc.
- JSONB field for images and raw data
- Indexed by status, property_type

**votes**
- User votes on listings (Yes/No + 1-5 score)
- Unique constraint per user/listing
- Linked to users and listings

**comments**
- User comments on listings
- Timestamped with created_at/updated_at
- Linked to users and listings

**commutes**
- Commute/travel information per listing
- JSONB for flexible commute data storage
- travel_seconds indexed for sorting

## Authentication

### Password Hashing
- Uses Argon2 (stronger than bcrypt)
- Automatic rehashing on login if parameters change

### JWT Tokens
- Access tokens expire after 24 hours (configurable)
- Tokens include user_id and username
- Use `Authorization: Bearer <token>` header

### Example Usage

```python
from api.auth import hash_password, verify_password, create_access_token

# Hash password
hashed = hash_password("user_password")

# Verify password
is_valid = verify_password("user_password", hashed)

# Create token
token = create_access_token({"sub": user_id, "username": username})
```

## Migrations

### Create a New Migration

After modifying models in `api/models.py`:

```bash
cd api
alembic revision --autogenerate -m "Description of changes"
```

### Apply Migrations

```bash
alembic upgrade head
```

### Rollback Migration

```bash
alembic downgrade -1
```

## Directory Structure

```
api/
├── __init__.py           # Package initialization
├── config.py             # Configuration (DATABASE_URL, SECRET_KEY)
├── database.py           # DB engine, session factory
├── models.py             # SQLAlchemy models
├── auth.py               # Authentication helpers
├── requirements.txt      # Python dependencies
├── alembic.ini          # Alembic configuration
├── alembic/             # Migrations
│   ├── env.py           # Alembic environment
│   ├── script.py.mako   # Migration template
│   └── versions/        # Migration files
└── scripts/
    ├── seed_users.py         # Create Tom/MQ users
    └── import_json_to_pg.py  # Migrate JSON → Postgres
```

## Next Steps

1. **Update Frontend API endpoints** to use database instead of JSON files
2. **Add authentication** to vote/comment endpoints
3. **Implement login/register** endpoints in Flask app
4. **Add JWT middleware** to validate tokens on protected routes
5. **Server-side ranking sort** for better performance

## Troubleshooting

### Connection Errors

Check Postgres is running:
```bash
docker ps | grep postgres
```

Test connection:
```bash
psql postgresql://housefinder:housefinder@localhost:5432/housefinder
```

### Import Issues

Ensure seed_users.py has been run before import:
```bash
python api/scripts/seed_users.py
python api/scripts/import_json_to_pg.py
```

### Migration Conflicts

Reset migrations (development only):
```bash
alembic downgrade base
alembic upgrade head
```

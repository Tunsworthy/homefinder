"""Configuration for API server and database."""
import os
from pathlib import Path

# Database
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://housefinder:housefinder@localhost:5432/housefinder')

# Auth
SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours
JWT_REFRESH_TOKEN_EXPIRE_DAYS = 30

# Data directory for legacy JSON files (used during import)
DATA_DIR = Path(__file__).parent.parent / 'backend'

import os
import cloudinary
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base # Updated import for newer SQLAlchemy
from sqlalchemy.orm import sessionmaker

# ==========================================
# 1. CLOUDINARY CONFIGURATION (SECURE)
# ==========================================
# This pulls the secret from Render's Environment Variables safely.
cloudinary.config( 
  cloud_name = "dvdfjknil", 
  api_key = "452245293533251", 
  api_secret = os.getenv("WPLiRjhMyG4GVKFBDjrz0zFrEf4"), 
  secure = True
)

# ==========================================
# 2. NEON DATABASE CONFIGURATION (SECURE)
# ==========================================
# Fetch the URL from Render. It should look like: postgresql://user:password@ep-name.region.aws.neon.tech/neondb
SQLALCHEMY_DATABASE_URL = os.getenv("postgresql://neondb_owner:npg_wYLdSsg4kVn8@ep-broad-feather-aev320j5-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require")

# Only connect if the URL exists (prevents crashes when testing locally without a DB)
if SQLALCHEMY_DATABASE_URL:
    # Neon DB requires SSL, so we add the sslmode argument
    engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={'sslmode': 'require'})
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    print("Database Engine Initialized Successfully.")
else:
    engine = None
    SessionLocal = None
    print("WARNING: No DATABASE_URL found. Running in memory-only mode.")

Base = declarative_base()

# Dependency to use in FastAPI routes later
def get_db():
    if not SessionLocal:
        yield None
        return
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
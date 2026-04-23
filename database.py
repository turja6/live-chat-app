from sqlalchemy import create_engine, Column, Integer, String, Text, or_, and_
from sqlalchemy.orm import declarative_base, sessionmaker
import json
from datetime import datetime
import os

# ==========================================
# 1. SMART DATABASE CONFIGURATION
# ==========================================
# If you have a Neon/Postgres URL, paste it here. 
# If not, it will automatically use a fast local file (idlycall_local.db).
DEFAULT_URL = "sqlite:///./idlycall_local.db"
CLOUD_URL = "postgresql://neondb_owner:npg_wYLdSsg4kVn8@ep-broad-feather-aev320j5-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require" # <--- PASTE YOUR URL HERE OR LEAVE IT

# Use Cloud URL only if it looks valid (contains @), otherwise use Local
if "@" in CLOUD_URL:
    SQLALCHEMY_DATABASE_URL = CLOUD_URL
    engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True, pool_size=5, max_overflow=10)
else:
    SQLALCHEMY_DATABASE_URL = DEFAULT_URL
    engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
    print("⚠️ Cloud DB URL not found. Using Local SQLite for speed.")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ==========================================
# 2. DATABASE MODELS
# ==========================================
class User(Base):
    __tablename__ = "users"
    username = Column(String, primary_key=True, index=True)
    profile_pic = Column(Text, default="/static/IC.png")
    status = Column(String, default="Offline")

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, autoincrement=True)
    msg_id = Column(String, unique=True, index=True)
    sender = Column(String, nullable=False)
    receiver = Column(String, nullable=False)
    profile_pic = Column(Text)
    message = Column(Text, nullable=False)
    timestamp = Column(String)
    reactions = Column(Text, default="{}")

# ==========================================
# 3. HELPER FUNCTIONS
# ==========================================
def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def update_user(username, profile_pic, status):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if user:
            user.profile_pic = profile_pic
            user.status = status
        else:
            new_user = User(username=username, profile_pic=profile_pic, status=status)
            db.add(new_user)
        db.commit()
    finally:
        db.close()

def update_status_only(username, status):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if user:
            user.status = status
            db.commit()
    finally:
        db.close()

def get_all_users():
    db = SessionLocal()
    try:
        users = db.query(User).all()
        return [{"username": u.username, "profile_pic": u.profile_pic, "status": u.status} for u in users]
    finally:
        db.close()

def save_message(msg_id, sender, receiver, profile_pic, message):
    db = SessionLocal()
    try:
        ts = datetime.now().strftime("%I:%M %p")
        new_msg = Message(
            msg_id=msg_id, sender=sender, receiver=receiver,
            profile_pic=profile_pic, message=message, timestamp=ts, reactions="{}"
        )
        db.add(new_msg)
        db.commit()
    finally:
        db.close()

def add_reaction(msg_id, emoji):
    db = SessionLocal()
    try:
        msg = db.query(Message).filter(Message.msg_id == msg_id).first()
        if msg:
            reactions = json.loads(msg.reactions)
            reactions[emoji] = reactions.get(emoji, 0) + 1
            msg.reactions = json.dumps(reactions)
            db.commit()
    finally:
        db.close()

def get_history(user1, user2="Public"):
    db = SessionLocal()
    try:
        if user2 == "Public":
            messages = db.query(Message).filter(Message.receiver == "Public").order_by(Message.id.desc()).limit(50).all()
        else:
            messages = db.query(Message).filter(
                or_(
                    and_(Message.sender == user1, Message.receiver == user2),
                    and_(Message.sender == user2, Message.receiver == user1)
                )
            ).order_by(Message.id.desc()).limit(50).all()
        
        return [{
            "msg_id": msg.msg_id, "sender": msg.sender, "profile_pic": msg.profile_pic,
            "message": msg.message, "timestamp": msg.timestamp, "reactions": json.loads(msg.reactions)
        } for msg in reversed(messages)]
    finally:
        db.close()
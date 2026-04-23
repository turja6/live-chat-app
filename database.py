from sqlalchemy import create_engine, Column, Integer, String, Text, or_, and_
from sqlalchemy.orm import declarative_base, sessionmaker
import json
from datetime import datetime

# ==========================================
# 1. YOUR NEON CLOUD DATABASE URL
# ==========================================
# Make sure to replace YOUR_SECRET_PASSWORD with your actual password
SQLALCHEMY_DATABASE_URL = "postgresql://neondb_owner:npg_wYLdSsg4kVn8@ep-broad-feather-aev320j5-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# ==========================================
# 2. DATABASE MODELS (TABLES)
# ==========================================

class User(Base):
    __tablename__ = "users"
    
    username = Column(String, primary_key=True, index=True)
    profile_pic = Column(Text, default="/static/IC.png")
    status = Column(String, default="Offline")

class Message(Base):
    __tablename__ = "messages"
    
    # We use an auto-incrementing ID here to perfectly replace SQLite's "rowid" sorting
    id = Column(Integer, primary_key=True, autoincrement=True)
    msg_id = Column(String, unique=True, index=True)
    sender = Column(String, nullable=False)
    receiver = Column(String, nullable=False)
    profile_pic = Column(Text)
    message = Column(Text, nullable=False)
    timestamp = Column(String)
    reactions = Column(Text, default="{}")

# ==========================================
# 3. HELPER FUNCTIONS FOR main.py
# ==========================================

def init_db():
    # Automatically creates the tables in Neon if they don't exist yet
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
            msg_id=msg_id,
            sender=sender,
            receiver=receiver,
            profile_pic=profile_pic,
            message=message,
            timestamp=ts,
            reactions="{}"
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
            # Fetches the last 50 public messages
            messages = db.query(Message).filter(Message.receiver == "Public").order_by(Message.id.desc()).limit(50).all()
        else:
            # Fetches private messages between the two users
            messages = db.query(Message).filter(
                or_(
                    and_(Message.sender == user1, Message.receiver == user2),
                    and_(Message.sender == user2, Message.receiver == user1)
                )
            ).order_by(Message.id.desc()).limit(50).all()
        
        # Reverse and format exactly how your frontend expects it
        return [{
            "msg_id": msg.msg_id, 
            "sender": msg.sender, 
            "profile_pic": msg.profile_pic, 
            "message": msg.message, 
            "timestamp": msg.timestamp, 
            "reactions": json.loads(msg.reactions)
        } for msg in reversed(messages)]
    finally:
        db.close()
from sqlalchemy import create_engine, Column, Integer, String, Text, or_, and_, JSON
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
import os

SQLALCHEMY_DATABASE_URL = "postgresql://neondb_owner:npg_wYLdSsg4kVn8@ep-broad-feather-aev320j5-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "app_users_v3"
    username = Column(String, primary_key=True)
    profile_pic = Column(Text)
    status = Column(String, default="Offline")
    metadata_json = Column(JSON, default={}) # Plugin metadata

class Message(Base):
    __tablename__ = "app_messages_v3"
    id = Column(Integer, primary_key=True, autoincrement=True)
    sender = Column(String, index=True)
    receiver = Column(String, index=True) 
    profile_pic = Column(Text)
    content = Column(Text)
    timestamp = Column(String)
    metadata_json = Column(JSON, default={}) # Plugin metadata

def init_db():
    Base.metadata.create_all(bind=engine)
    print("✅ Database with Profiles & Plugin Metadata Ready")

def update_user(username, profile_pic, status):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if user:
            if profile_pic: user.profile_pic = profile_pic
            user.status = status
        else:
            new_user = User(username=username, profile_pic=profile_pic, status=status)
            db.add(new_user)
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

def save_message(sender, receiver, profile_pic, content):
    db = SessionLocal()
    try:
        ts = datetime.now().strftime("%I:%M %p")
        new_msg = Message(sender=sender, receiver=receiver, profile_pic=profile_pic, content=content, timestamp=ts)
        db.add(new_msg)
        db.commit()
        return ts
    finally:
        db.close()

def get_chat_history(user1, user2):
    db = SessionLocal()
    try:
        if user2 == "Public":
            msgs = db.query(Message).filter(Message.receiver == "Public").order_by(Message.id.desc()).limit(500).all() 
        else:
            msgs = db.query(Message).filter(
                or_(
                    and_(Message.sender == user1, Message.receiver == user2),
                    and_(Message.sender == user2, Message.receiver == user1)
                )
            ).order_by(Message.id.desc()).limit(500).all()
        
        return [{
            "id": m.id,
            "sender": m.sender, 
            "profile_pic": m.profile_pic, 
            "content": m.content, 
            "timestamp": m.timestamp,
            "metadata_json": m.metadata_json
        } for m in reversed(msgs)]
    finally:
        db.close()

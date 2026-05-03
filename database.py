from sqlalchemy import create_engine, Column, Integer, String, Text, or_, and_
from sqlalchemy.orm import declarative_base, sessionmaker
import json
from datetime import datetime

# ==========================================
# 1. YOUR NEON CLOUD DATABASE URL
# ==========================================
SQLALCHEMY_DATABASE_URL = "postgresql://neondb_owner:npg_wYLdSsg4kVn8@ep-broad-feather-aev320j5.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    pool_pre_ping=True,
    pool_recycle=300,
    connect_args={
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5
    }
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

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

def init_db():
    try:
        Base.metadata.create_all(bind=engine)
        print("✅ Database tables connected and verified.")
    except Exception as e:
        print(f"❌ FATAL DB ERROR: {e}")

def update_user(username, profile_pic, status):
    db = None
    try:
        db = SessionLocal()
        user = db.query(User).filter(User.username == username).first()
        if user:
            user.profile_pic = profile_pic
            user.status = status
        else:
            new_user = User(username=username, profile_pic=profile_pic, status=status)
            db.add(new_user)
        db.commit()
    except Exception as e:
        if db: db.rollback()
        print(f"❌ DB ERROR (update_user): {e}")
    finally:
        if db: db.close()

def update_status_only(username, status):
    db = None
    try:
        db = SessionLocal()
        user = db.query(User).filter(User.username == username).first()
        if user:
            user.status = status
            db.commit()
    except Exception as e:
        if db: db.rollback()
        print(f"❌ DB ERROR (update_status): {e}")
    finally:
        if db: db.close()

def get_all_users():
    db = None
    try:
        db = SessionLocal()
        users = db.query(User).all()
        return [{"username": u.username, "profile_pic": u.profile_pic, "status": u.status} for u in users]
    except Exception as e:
        print(f"❌ DB ERROR (get_all_users): {e}")
        return []
    finally:
        if db: db.close()

def save_message(msg_id, sender, receiver, profile_pic, message):
    db = None
    try:
        db = SessionLocal()
        ts = datetime.now().strftime("%I:%M %p")
        new_msg = Message(
            msg_id=msg_id, sender=sender, receiver=receiver,
            profile_pic=profile_pic, message=message,
            timestamp=ts, reactions="{}"
        )
        db.add(new_msg)
        db.commit()
    except Exception as e:
        if db: db.rollback()
        print(f"❌ DB ERROR (save_message): {e}")
    finally:
        if db: db.close()

def add_reaction(msg_id, emoji):
    db = None
    try:
        db = SessionLocal()
        msg = db.query(Message).filter(Message.msg_id == msg_id).first()
        if msg:
            reactions = json.loads(msg.reactions) if msg.reactions else {}
            reactions[emoji] = reactions.get(emoji, 0) + 1
            msg.reactions = json.dumps(reactions)
            db.commit()
    except Exception as e:
        if db: db.rollback()
        print(f"❌ DB ERROR (add_reaction): {e}")
    finally:
        if db: db.close()

def get_history(user1, user2="Public"):
    db = None
    try:
        db = SessionLocal()
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
            "message": msg.message, "timestamp": msg.timestamp, 
            "reactions": json.loads(msg.reactions) if msg.reactions else {}
        } for msg in reversed(messages)]
    except Exception as e:
        print(f"❌ DB ERROR (get_history): {e}")
        return [] 
    finally:
        if db: db.close()
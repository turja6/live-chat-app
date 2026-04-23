from sqlalchemy import create_engine, Column, Integer, String, Text, or_, and_
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime
import json

DATABASE_URL = "postgresql://neondb_owner:YOUR_PASSWORD@ep-xxx.neon.tech/neondb?sslmode=require"

engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    username = Column(String, primary_key=True)
    profile_pic = Column(Text)
    status = Column(String)


class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, autoincrement=True)
    msg_id = Column(String, unique=True)
    sender = Column(String)
    receiver = Column(String)
    profile_pic = Column(Text)
    message = Column(Text)
    timestamp = Column(String)


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    return SessionLocal()


def save_message(msg_id, sender, receiver, pic, msg):
    db = get_db()
    try:
        db.add(Message(
            msg_id=msg_id,
            sender=sender,
            receiver=receiver,
            profile_pic=pic,
            message=msg,
            timestamp=datetime.now().strftime("%I:%M %p")
        ))
        db.commit()
    finally:
        db.close()


def get_history(user1, user2="Public"):
    db = get_db()
    try:
        if user2 == "Public":
            msgs = db.query(Message).filter(
                Message.receiver == "Public"
            ).order_by(Message.id.desc()).limit(20).all()
        else:
            msgs = db.query(Message).filter(
                or_(
                    and_(Message.sender == user1, Message.receiver == user2),
                    and_(Message.sender == user2, Message.receiver == user1)
                )
            ).order_by(Message.id.desc()).limit(20).all()

        return [{
            "msg_id": m.msg_id,
            "sender": m.sender,
            "profile_pic": m.profile_pic,
            "message": m.message,
            "timestamp": m.timestamp
        } for m in reversed(msgs)]

    finally:
        db.close()
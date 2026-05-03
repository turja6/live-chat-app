from sqlalchemy import create_engine, Column, Integer, String, Text, or_, and_
from sqlalchemy.orm import declarative_base, sessionmaker

# Hardcoded database connection as requested
SQLALCHEMY_DATABASE_URL = "postgresql://neondb_owner:npg_wYLdSsg4kVn8@ep-broad-feather-aev320j5.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"

engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Message(Base):
    __tablename__ = "pro_messages"
    id = Column(Integer, primary_key=True, autoincrement=True)
    sender = Column(String, index=True)
    receiver = Column(String, index=True) # Will be "Public" or a specific username
    content = Column(Text)

def init_db():
    Base.metadata.create_all(bind=engine)
    print("✅ Pro DB Ready")

def save_message(sender, receiver, content):
    db = SessionLocal()
    try:
        new_msg = Message(sender=sender, receiver=receiver, content=content)
        db.add(new_msg)
        db.commit()
    finally:
        db.close()

def get_chat_history(user1, user2):
    db = SessionLocal()
    try:
        if user2 == "Public":
            msgs = db.query(Message).filter(Message.receiver == "Public").order_by(Message.id.desc()).limit(50).all()
        else:
            # For DMs, grab messages sent between user1 AND user2
            msgs = db.query(Message).filter(
                or_(
                    and_(Message.sender == user1, Message.receiver == user2),
                    and_(Message.sender == user2, Message.receiver == user1)
                )
            ).order_by(Message.id.desc()).limit(50).all()
        return [{"sender": m.sender, "content": m.content} for m in reversed(msgs)]
    finally:
        db.close()
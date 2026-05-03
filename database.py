from sqlalchemy import create_engine, Column, Integer, String, Text
from sqlalchemy.orm import declarative_base, sessionmaker

# Your existing Neon Database
SQLALCHEMY_DATABASE_URL = "postgresql://neondb_owner:npg_wYLdSsg4kVn8@ep-broad-feather-aev320j5.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"

engine = create_engine(SQLALCHEMY_DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Message(Base):
    __tablename__ = "simple_messages"
    id = Column(Integer, primary_key=True, autoincrement=True)
    sender = Column(String, index=True)
    content = Column(Text)

def init_db():
    Base.metadata.create_all(bind=engine)
    print("✅ Simple DB Ready")

def save_message(sender, content):
    db = SessionLocal()
    try:
        new_msg = Message(sender=sender, content=content)
        db.add(new_msg)
        db.commit()
    finally:
        db.close()

def get_recent_messages():
    db = SessionLocal()
    try:
        # Get last 50 messages
        msgs = db.query(Message).order_by(Message.id.desc()).limit(50).all()
        return [{"sender": m.sender, "content": m.content} for m in reversed(msgs)]
    finally:
        db.close()
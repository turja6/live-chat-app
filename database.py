"""
Database Configuration for Neon.tech
PostgreSQL-as-a-Service
"""

import os
import asyncio
from typing import Optional, List, Dict, Any
import logging

logger = logging.getLogger(__name__)

# ============================================================
# NEON.TECH DATABASE URL
# 
# Render automatically sets DATABASE_URL when you add
# the Neon Postgres addon. Format:
# postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
# ============================================================

DATABASE_URL = os.getenv("DATABASE_URL", "")

# Async connection string for asyncpg
DATABASE_URL_ASYNC = DATABASE_URL.replace(
    "postgresql://", 
    "postgresql+asyncpg://"
) if DATABASE_URL else ""

# ============================================================
# ASYNC DATABASE MANAGER
# ============================================================

class DatabaseManager:
    """
    Async database manager for Neon.tech
    Uses asyncpg for high-performance async queries
    """
    
    def __init__(self, database_url: str = None):
        self.url = database_url or DATABASE_URL_ASYNC
        self.pool = None
        self.connected = False
    
    async def connect(self):
        """Create connection pool to Neon.tech"""
        if not self.url:
            logger.warning("No DATABASE_URL configured. Using in-memory mode.")
            return False
        
        try:
            import asyncpg
            self.pool = await asyncpg.create_pool(
                self.url,
                min_size=5,
                max_size=20,
                command_timeout=60
            )
            self.connected = True
            logger.info("✅ Connected to Neon.tech database")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to connect to database: {e}")
            self.connected = False
            return False
    
    async def disconnect(self):
        """Close connection pool"""
        if self.pool:
            await self.pool.close()
            self.connected = False
            logger.info("🔌 Disconnected from database")
    
    async def execute(self, query: str, *args) -> Any:
        """Execute a SQL query"""
        if not self.connected:
            raise RuntimeError("Not connected to database")
        
        async with self.pool.acquire() as conn:
            return await conn.fetch(query, *args)
    
    async def execute_many(self, query: str, args_list: list) -> Any:
        """Execute multiple queries"""
        if not self.connected:
            raise RuntimeError("Not connected to database")
        
        async with self.pool.acquire() as conn:
            return await conn.executemany(query, args_list)
    
    # ============================================================
    # USER TABLE OPERATIONS
    # ============================================================
    
    async def create_tables(self):
        """Create necessary tables if they don't exist"""
        
        create_users_table = """
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(255),
            profile_pic TEXT,
            is_online BOOLEAN DEFAULT FALSE,
            last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """
        
        create_messages_table = """
        CREATE TABLE IF NOT EXISTS messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            sender_id INTEGER REFERENCES users(id),
            receiver_id INTEGER REFERENCES users(id) OR receiver_id IS NULL,
            content TEXT NOT NULL,
            message_type VARCHAR(20) DEFAULT 'text',
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """
        
        create_calls_table = """
        CREATE TABLE IF NOT EXISTS calls (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            caller_id INTEGER REFERENCES users(id),
            callee_id INTEGER REFERENCES users(id),
            call_type VARCHAR(10) NOT NULL, -- 'voice' or 'video'
            status VARCHAR(20) DEFAULT 'initiated', -- initiated, accepted, declined, ended, missed
            started_at TIMESTAMP WITH TIME ZONE,
            ended_at TIMESTAMP WITH TIME ZONE,
            duration_seconds INTEGER,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
        """
        
        # Create indexes for performance
        create_indexes = """
        CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
        CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
        CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
        CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        CREATE INDEX IF NOT EXISTS idx_users_online ON users(is_online);
        """
        
        try:
            async with self.pool.acquire() as conn:
                await conn.execute(create_users_table)
                await conn.execute(create_messages_table)
                await conn.execute(create_calls_table)
                await conn.execute(create_indexes)
            
            logger.info("✅ Database tables verified/created")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error creating tables: {e}")
            return False
    
    async def upsert_user(self, username: str, profile_pic: str = None) -> int:
        """Create or update user, returns user ID"""
        
        query = """
        INSERT INTO users (username, profile_pic, is_online, last_seen, updated_at)
        VALUES ($1, $2, TRUE, NOW(), NOW())
        ON CONFLICT (username) 
        DO UPDATE SET 
            profile_pic = COALESCE($2, users.profile_pic),
            is_online = TRUE,
            last_seen = NOW(),
            updated_at = NOW()
        RETURNING id;
        """
        
        result = await self.execute(query, username, profile_pic)
        return result[0]['id'] if result else None
    
    async def mark_user_offline(self, username: str):
        """Mark user as offline"""
        
        query = """
        UPDATE users SET 
            is_online = FALSE, 
            last_seen = NOW(), 
            updated_at = NOW()
        WHERE username = $1;
        """
        
        await self.execute(query, username)
    
    async def get_online_users(self) -> List[Dict]:
        """Get all currently online users"""
        
        query = """
        SELECT username, profile_pic, is_online, last_seen 
        FROM users 
        WHERE is_online = TRUE 
        ORDER BY last_seen DESC;
        """
        
        results = await self.execute(query)
        return [dict(row) for row in results]
    
    # ============================================================
    # MESSAGE OPERATIONS
    # ============================================================
    
    async def save_message(self, sender: str, receiver: str, content: str, 
                          sender_pic: str = None, msg_type: str = "text") -> Dict:
        """Save a message and return it"""
        
        # Get or create users
        sender_id = await self.upsert_user(sender, sender_pic)
        receiver_id = await self.upsert_user(receiver) if receiver else None
        
        query = """
        INSERT INTO messages (sender_id, receiver_id, content, message_type)
        VALUES ($1, $2, $3, $4)
        RETURNING id, sender_id, content, message_type, created_at;
        """
        
        result = await self.execute(query, sender_id, receiver_id, content, msg_type)
        
        if result:
            row = dict(result[0])
            return {
                "id": str(row['id']),
                "sender": sender,
                "receiver": receiver,
                "message": content,
                "profile_pic": sender_pic or "",
                "type": msg_type,
                "timestamp": row['created_at'].strftime("%H:%M") if hasattr(row['created_at'], 'strftime') else "",
                "created_at": row['created_at'].isoformat() if hasattr(row['created_at'], 'isoformat') else ""
            }
        
        return {}
    
    async def get_chat_history(self, user1: str, user2: str, limit: int = 100) -> List[Dict]:
        """Get chat history between two users"""
        
        query = """
        SELECT m.content, m.message_type, m.created_at,
               s.username as sender, s.profile_pic as sender_pic
        FROM messages m
        JOIN users s ON m.sender_id = s.id
        WHERE (
            (s.username = $1 AND m.receiver_id = (SELECT id FROM users WHERE username = $2)) OR
            (s.username = $2 AND m.receiver_id = (SELECT id FROM users WHERE username = $1))
        )
        ORDER BY m.created_at ASC
        LIMIT $3;
        """
        
        results = await self.execute(query, user1, user2, limit)
        
        messages = []
        for row in results:
            r = dict(row)
            messages.append({
                "message": r['content'],
                "sender": r['sender'],
                "profile_pic": r['sender_pic'] or "",
                "timestamp": r['created_at'].strftime("%H:%M") if hasattr(r['created_at'], 'strftime') else ""
            })
        
        return messages

# ============================================================
# SINGLETON INSTANCE
# ============================================================

db = DatabaseManager()

# Auto-connect on import (optional, you can also call db.connect() manually)
# This won't actually connect until an async context is available

async def get_db():
    """Get database instance, connect if needed"""
    if not db.connected:
        await db.connect()
        await db.create_tables()
    return db

# Export for use in main.py
__all__ = ['DatabaseManager', 'db', 'get_db']
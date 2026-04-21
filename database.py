import sqlite3
import json
from datetime import datetime

def get_db():
    return sqlite3.connect('chat.db', check_same_thread=False)

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''CREATE TABLE IF NOT EXISTS users
                      (username TEXT PRIMARY KEY, profile_pic TEXT, status TEXT)''')
    # ADDED: msg_id and reactions columns
    cursor.execute('''CREATE TABLE IF NOT EXISTS messages
                      (msg_id TEXT PRIMARY KEY, sender TEXT, receiver TEXT, profile_pic TEXT, message TEXT, timestamp TEXT, reactions TEXT)''')
    conn.commit()
    conn.close()

def update_user(username, profile_pic, status):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT OR REPLACE INTO users (username, profile_pic, status) VALUES (?, ?, ?)", 
                   (username, profile_pic, status))
    conn.commit()
    conn.close()

def update_status_only(username, status):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET status = ? WHERE username = ?", (status, username))
    conn.commit()
    conn.close()

def get_all_users():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT username, profile_pic, status FROM users")
    users = [{"username": row[0], "profile_pic": row[1], "status": row[2]} for row in cursor.fetchall()]
    conn.close()
    return users

def save_message(msg_id, sender, receiver, profile_pic, message):
    conn = get_db()
    cursor = conn.cursor()
    timestamp = datetime.now().strftime("%I:%M %p")
    reactions = "{}" # Empty JSON string for new messages
    cursor.execute("INSERT INTO messages (msg_id, sender, receiver, profile_pic, message, timestamp, reactions) VALUES (?, ?, ?, ?, ?, ?, ?)",
                   (msg_id, sender, receiver, profile_pic, message, timestamp, reactions))
    conn.commit()
    conn.close()

def add_reaction(msg_id, emoji):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT reactions FROM messages WHERE msg_id = ?", (msg_id,))
    row = cursor.fetchone()
    if row:
        reactions = json.loads(row[0])
        reactions[emoji] = reactions.get(emoji, 0) + 1
        cursor.execute("UPDATE messages SET reactions = ? WHERE msg_id = ?", (json.dumps(reactions), msg_id))
        conn.commit()
    conn.close()

def get_history(user1, user2="Public"):
    conn = get_db()
    cursor = conn.cursor()
    if user2 == "Public":
        cursor.execute("SELECT msg_id, sender, profile_pic, message, timestamp, reactions FROM messages WHERE receiver = 'Public' ORDER BY rowid DESC LIMIT 50")
    else:
        cursor.execute('''SELECT msg_id, sender, profile_pic, message, timestamp, reactions FROM messages 
                          WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?) 
                          ORDER BY rowid DESC LIMIT 50''', (user1, user2, user2, user1))
    rows = cursor.fetchall()
    conn.close()
    return [{"msg_id": row[0], "sender": row[1], "profile_pic": row[2], "message": row[3], "timestamp": row[4], "reactions": json.loads(row[5])} for row in reversed(rows)]
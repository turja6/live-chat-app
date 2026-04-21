import sqlite3
from datetime import datetime

def get_db():
    return sqlite3.connect('chat.db', check_same_thread=False)

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''CREATE TABLE IF NOT EXISTS users
                      (username TEXT PRIMARY KEY, profile_pic TEXT, status TEXT)''')
    # Added "receiver" column to track private messages
    cursor.execute('''CREATE TABLE IF NOT EXISTS messages
                      (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                       sender TEXT, receiver TEXT, profile_pic TEXT, message TEXT, timestamp TEXT)''')
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

def save_message(sender, receiver, profile_pic, message):
    conn = get_db()
    cursor = conn.cursor()
    timestamp = datetime.now().strftime("%I:%M %p")
    cursor.execute("INSERT INTO messages (sender, receiver, profile_pic, message, timestamp) VALUES (?, ?, ?, ?, ?)",
                   (sender, receiver, profile_pic, message, timestamp))
    conn.commit()
    conn.close()

def get_history(user1, user2="Public"):
    conn = get_db()
    cursor = conn.cursor()
    if user2 == "Public":
        cursor.execute("SELECT sender, profile_pic, message, timestamp FROM messages WHERE receiver = 'Public' ORDER BY id DESC LIMIT 50")
    else:
        # Get private messages between user1 and user2
        cursor.execute('''SELECT sender, profile_pic, message, timestamp FROM messages 
                          WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?) 
                          ORDER BY id DESC LIMIT 50''', (user1, user2, user2, user1))
    rows = cursor.fetchall()
    conn.close()
    return [{"sender": row[0], "profile_pic": row[1], "message": row[2], "timestamp": row[3]} for row in reversed(rows)]
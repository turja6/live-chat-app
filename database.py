import sqlite3
from datetime import datetime

# Connect to the database file
def get_db():
    return sqlite3.connect('chat.db', check_same_thread=False)

# Create the tables if they don't exist
def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''CREATE TABLE IF NOT EXISTS users
                      (username TEXT PRIMARY KEY, profile_pic TEXT, status TEXT)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS messages
                      (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                       sender TEXT, profile_pic TEXT, message TEXT, timestamp TEXT)''')
    conn.commit()
    conn.close()

# Update a user's status (Online/Offline)
def update_user(username, profile_pic, status):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("INSERT OR REPLACE INTO users (username, profile_pic, status) VALUES (?, ?, ?)", 
                   (username, profile_pic, status))
    conn.commit()
    conn.close()
# Mark a user offline without changing their profile picture
def update_status_only(username, status):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET status = ? WHERE username = ?", (status, username))
    conn.commit()
    conn.close()

# Get a list of all users
def get_all_users():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT username, profile_pic, status FROM users")
    users = [{"username": row[0], "profile_pic": row[1], "status": row[2]} for row in cursor.fetchall()]
    conn.close()
    return users

# Save a new message
def save_message(sender, profile_pic, message):
    conn = get_db()
    cursor = conn.cursor()
    timestamp = datetime.now().strftime("%H:%M")
    cursor.execute("INSERT INTO messages (sender, profile_pic, message, timestamp) VALUES (?, ?, ?, ?)",
                   (sender, profile_pic, message, timestamp))
    conn.commit()
    conn.close()

# Load the last 50 messages
def get_history():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT sender, profile_pic, message, timestamp FROM messages ORDER BY id DESC LIMIT 50")
    rows = cursor.fetchall()
    conn.close()
    # Reverse the list so the oldest messages are at the top
    return [{"sender": row[0], "profile_pic": row[1], "message": row[2], "timestamp": row[3]} for row in reversed(rows)]
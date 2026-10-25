import sqlite3

conn = sqlite3.connect('library.db')
c = conn.cursor()

c.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = c.fetchall()
print("\n📚 Tables in your database:")
for t in tables:
    print("-", t[0])

if any("issued_books" in t for t in tables):
    print("\n🔍 Columns in issued_books table:")
    c.execute("PRAGMA table_info(issued_books);")
    for col in c.fetchall():
        print("-", col[1])

conn.close()

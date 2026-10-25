import sqlite3
import pandas as pd

conn = sqlite3.connect('library.db')
cur = conn.cursor()

df = pd.read_csv('books.csv')

for _, row in df.iterrows():
    cur.execute("""
        INSERT INTO books (title, author, category)
        VALUES (?, ?, ?)
    """, (row['title'], row['author'], row['category']))

conn.commit()
conn.close()

print("✅ Books imported successfully!")

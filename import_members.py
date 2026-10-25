import sqlite3
import pandas as pd

conn = sqlite3.connect('library.db')
cur = conn.cursor()

df = pd.read_csv('members.csv')

for _, row in df.iterrows():
    cur.execute("""
        INSERT INTO members (name, email, phone)
        VALUES (?, ?, ?)
    """, (row['name'], row['email'], row['phone']))

conn.commit()
conn.close()

print("✅ Members imported successfully!")

import json
import sqlite3

conn = sqlite3.connect('library.db')
c = conn.cursor()

c.execute("SELECT id, title, author, category FROM books WHERE status='available' LIMIT 1")
book = c.fetchone()

if book:
    book_id, title, author, category = book
    print(f"Testing with book: {title} by {author} (Category: {category})")
    
    c.execute("""
        SELECT id, title, author, category
        FROM books
        WHERE id != ? AND category = ? AND status = 'available'
        LIMIT 3
    """, (book_id, category))
    recommendations = c.fetchall()
    
    if recommendations:
        print(f"\nRecommended books ({len(recommendations)}):")
        for rec in recommendations:
            print(f"  - {rec[1]} by {rec[2]}")
    else:
        print(f"\nNo recommendations found for category: {category}")
        c.execute("""
            SELECT id, title, author, category
            FROM books
            WHERE id != ? AND status = 'available'
            LIMIT 3
        """, (book_id,))
        recommendations = c.fetchall()
        if recommendations:
            print(f"\nAlternative recommendations ({len(recommendations)}):")
            for rec in recommendations:
                print(f"  - {rec[1]} by {rec[2]}")
else:
    print("No available books found")

conn.close()





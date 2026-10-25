import sqlite3
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.decomposition import TruncatedSVD
import json
import os
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

class BookRecommendationModel:
    def __init__(self, db_path='library.db'):
        self.db_path = db_path
        self.model_path = 'recommendation_model.pkl'
        self.tfidf_vectorizer = None
        self.book_similarity_matrix = None
        self.user_item_matrix = None
        self.svd_model = None
        self.books_df = None
        
    def get_db_connection(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn
    
    def load_data(self):
        """Load books and member borrowing history from database"""
        try:
            conn = self.get_db_connection()
            cur = conn.cursor()
            
            cur.execute("SELECT id, title, author, category FROM books")
            books_data = cur.fetchall()
            
            if not books_data:
                print("No books found in database")
                conn.close()
                return None, None
            
            books = pd.DataFrame(books_data)
            books.columns = ['id', 'title', 'author', 'category']
            
            cur.execute("""
                SELECT member_id, book_id, return_date 
                FROM issued_books
            """)
            transactions_data = cur.fetchall()
            conn.close()
            
            if not transactions_data:
                print("No borrowing transactions found")
                return books, None
            
            transactions = pd.DataFrame(transactions_data)
            transactions.columns = ['member_id', 'book_id', 'return_date']
            
            user_item_data = []
            for idx, row in transactions.iterrows():
                weight = 1.5 if row['return_date'] is not None else 1.0
                user_item_data.append({
                    'member_id': row['member_id'],
                    'book_id': row['book_id'],
                    'interaction': weight
                })
            
            interactions_df = pd.DataFrame(user_item_data)
            
            
            user_item_matrix = interactions_df.pivot_table(
                index='member_id',
                columns='book_id',
                values='interaction',
                fill_value=0
            )
            
            return books, user_item_matrix
            
        except Exception as e:
            print(f"Error loading data: {e}")
            import traceback
            traceback.print_exc()
            return None, None
    
    def build_content_based_model(self, books):
        """Build content-based filtering using book features"""
        try:
            books['title'] = books['title'].fillna('')
            books['author'] = books['author'].fillna('')
            books['category'] = books['category'].fillna('')
            
            books['content'] = books['title'] + ' ' + books['author'] + ' ' + books['category']
            
            self.tfidf_vectorizer = TfidfVectorizer(max_features=100, stop_words='english')
            tfidf_matrix = self.tfidf_vectorizer.fit_transform(books['content'])
            
            self.book_similarity_matrix = cosine_similarity(tfidf_matrix)
            
            print("Content-based model built successfully")
            return books
            
        except Exception as e:
            print(f"Error building content model: {e}")
            import traceback
            traceback.print_exc()
            return books
    
    def build_collaborative_model(self, user_item_matrix):
        """Build collaborative filtering model using SVD"""
        try:
            if user_item_matrix is None or user_item_matrix.empty:
                print("User-item matrix is empty, skipping collaborative model")
                return None
            
            n_components = min(50, user_item_matrix.shape[0] - 1, user_item_matrix.shape[1] - 1)
            if n_components < 1:
                print("Not enough data for SVD")
                return None
            
            self.svd_model = TruncatedSVD(n_components=n_components, random_state=42)
            self.user_item_matrix = user_item_matrix.copy()
            
            self.svd_model.fit(user_item_matrix)
            print("Collaborative model built successfully")
            return self.svd_model
            
        except Exception as e:
            print(f"Warning in SVD fitting: {e}")
            return None
    
    def train(self):
        """Train the complete recommendation model"""
        try:
            print("Loading data...")
            books, user_item_matrix = self.load_data()
            
            if books is None:
                print("Failed to load books")
                return False
            
            print(f"Loaded {len(books)} books")
            
            print("Building content-based model...")
            books = self.build_content_based_model(books)
            self.books_df = books
            
            if user_item_matrix is not None:
                print(f"Loaded {len(user_item_matrix)} members with history")
                print("Building collaborative filtering model...")
                self.build_collaborative_model(user_item_matrix)
            else:
                print("No user-item matrix available for collaborative filtering")
            
            print("Model training completed!")
            self.save_model()
            return True
            
        except Exception as e:
            print(f"Error during training: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def get_content_based_recommendations(self, book_ids, books_df, num_recommendations=5):
        """Get recommendations based on similar books"""
        try:
            if self.book_similarity_matrix is None or len(book_ids) == 0:
                return []
            
            similarity_scores = np.zeros(self.book_similarity_matrix.shape[0])
            
            for book_id in book_ids:
                book_indices = books_df[books_df['id'] == book_id].index
                if len(book_indices) > 0:
                    book_idx = book_indices[0]
                    if book_idx < len(self.book_similarity_matrix):
                        similarity_scores += self.book_similarity_matrix[book_idx]
            
            if len(book_ids) > 0:
                similarity_scores /= len(book_ids)
            
            for book_id in book_ids:
                book_indices = books_df[books_df['id'] == book_id].index
                if len(book_indices) > 0:
                    book_idx = book_indices[0]
                    similarity_scores[book_idx] = -1
            
            top_indices = np.argsort(similarity_scores)[-num_recommendations:][::-1]
            recommendations = []
            
            for idx in top_indices:
                if similarity_scores[idx] > 0 and idx < len(books_df):
                    book = books_df.iloc[idx]
                    recommendations.append({
                        'book_id': int(book['id']),
                        'title': str(book['title']),
                        'author': str(book['author']),
                        'category': str(book['category']) if book['category'] else 'Uncategorized',
                        'score': float(similarity_scores[idx]),
                        'reason': f"Similar to books you've read in {book['category']}"
                    })
            
            return recommendations
            
        except Exception as e:
            print(f"Error in content-based recommendations: {e}")
            return []
    
    def get_collaborative_recommendations(self, member_id, books_df, num_recommendations=5):
        """Get recommendations based on similar users"""
        try:
            if self.user_item_matrix is None or self.svd_model is None:
                return []
            
            if member_id not in self.user_item_matrix.index:
                return []
            
            member_idx = list(self.user_item_matrix.index).index(member_id)
            
            user_factors = self.svd_model.transform(self.user_item_matrix[member_idx:member_idx+1])
            
            item_factors = self.svd_model.components_.T
            scores = user_factors.dot(item_factors.T).flatten()
            
            member_books = set(self.user_item_matrix.columns[
                self.user_item_matrix.iloc[member_idx] > 0
            ])
            
            recommendations = []
            for book_id in np.argsort(scores)[::-1]:
                if book_id not in member_books and len(recommendations) < num_recommendations:
                    book = books_df[books_df['id'] == book_id]
                    if not book.empty:
                        book_row = book.iloc[0]
                        recommendations.append({
                            'book_id': int(book_row['id']),
                            'title': str(book_row['title']),
                            'author': str(book_row['author']),
                            'category': str(book_row['category']) if book_row['category'] else 'Uncategorized',
                            'score': float(scores[book_id]) if book_id < len(scores) else 0,
                            'reason': f"Recommended based on members with similar tastes"
                        })
            
            return recommendations
            
        except Exception as e:
            print(f"Collaborative filtering error: {e}")
            return []
    
    def get_recommendations(self, member_id, num_recommendations=5):
        """Get hybrid recommendations combining content and collaborative"""
        try:
            conn = self.get_db_connection()
            cur = conn.cursor()
            
            cur.execute("""
                SELECT DISTINCT book_id FROM issued_books WHERE member_id = ?
            """, (member_id,))
            borrowed_books = [row[0] for row in cur.fetchall()]
            
            cur.execute("SELECT id, title, author, category FROM books WHERE status = 'available'")
            available_books_data = cur.fetchall()
            conn.close()
            
            if not available_books_data:
                return []
            
            available_books = pd.DataFrame(available_books_data)
            available_books.columns = ['id', 'title', 'author', 'category']
            
            content_recs = self.get_content_based_recommendations(
                borrowed_books, available_books, num_recommendations
            )
            collab_recs = self.get_collaborative_recommendations(
                member_id, available_books, num_recommendations
            )
            
            all_recs = {}
            for rec in content_recs:
                all_recs[rec['book_id']] = {**rec, 'content_score': rec['score']}
            
            for rec in collab_recs:
                if rec['book_id'] in all_recs:
                    all_recs[rec['book_id']]['collab_score'] = rec['score']
                    all_recs[rec['book_id']]['reason'] = f"Content + Collaborative match: {rec['reason']}"
                else:
                    all_recs[rec['book_id']] = {**rec, 'collab_score': rec['score']}
            
            final_recs = []
            for book_id, rec in all_recs.items():
                content_score = rec.get('content_score', 0)
                collab_score = rec.get('collab_score', 0)
                
                final_score = (content_score * 0.6) + (collab_score * 0.4) if (content_score > 0 or collab_score > 0) else 0
                if final_score > 0:
                    rec['final_score'] = final_score
                    final_recs.append(rec)
            
            final_recs.sort(key=lambda x: x['final_score'], reverse=True)
            
            return final_recs[:num_recommendations]
            
        except Exception as e:
            print(f"Error in get_recommendations: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def save_model(self):
        """Save model state"""
        try:
            import pickle
            model_state = {
                'book_similarity_matrix': self.book_similarity_matrix,
                'user_item_matrix': self.user_item_matrix,
                'svd_model': self.svd_model,
                'tfidf_vectorizer': self.tfidf_vectorizer,
                'books_df': self.books_df,
                'timestamp': datetime.now().isoformat()
            }
            with open(self.model_path, 'wb') as f:
                pickle.dump(model_state, f)
            print(f"✓ Model saved to {self.model_path}")
            return True
        except Exception as e:
            print(f"Error saving model: {e}")
            return False
    
    def load_model(self):
        """Load saved model state"""
        import pickle
        if os.path.exists(self.model_path):
            try:
                with open(self.model_path, 'rb') as f:
                    model_state = pickle.load(f)
                self.book_similarity_matrix = model_state.get('book_similarity_matrix')
                self.user_item_matrix = model_state.get('user_item_matrix')
                self.svd_model = model_state.get('svd_model')
                self.tfidf_vectorizer = model_state.get('tfidf_vectorizer')
                self.books_df = model_state.get('books_df')
                print(f"✓ Model loaded from {self.model_path}")
                return True
            except Exception as e:
                print(f"Error loading model: {e}")
                return False
        return False

recommendation_model = BookRecommendationModel()

def init_recommendation_model():
    """Initialize and train the model"""
    if not recommendation_model.load_model():
        recommendation_model.train()

def get_ml_recommendations(member_id, num_recommendations=5):
    """Get ML-based recommendations for a member"""
    return recommendation_model.get_recommendations(member_id, num_recommendations)

def retrain_model():
    """Retrain the model (call after significant data changes)"""
    recommendation_model.train()
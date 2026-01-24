import os
import json
import firebase_admin
from firebase_admin import credentials, firestore
import argparse
from datetime import datetime

# --- CONFIGURATION ---
DATA_DIR = os.path.join(os.path.dirname(__file__), '../data')
SERVICE_ACCOUNT_KEY = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')

def upload_file(db, file_path):
    print(f"📄 Processing: {os.path.basename(file_path)}")
    
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    for law in data:
        category = law.get('category')
        title = law.get('title')
        content = law.get('content', {})
        articles = content.get('articles', [])
        
        print(f"📚 Uploading: {title} ({len(articles)} items)")
        
        # Split metadata and articles
        metadata = {k: v for k, v in law.items() if k != 'content'}
        metadata['lastUpdated'] = firestore.SERVER_TIMESTAMP
        metadata['itemCount'] = len(articles)
        
        # 1. Update/Create Law Metadata
        db.collection('laws').document(category).set(metadata)
        
        # 2. Upload Articles/Headers to subcollection
        items_ref = db.collection('laws').document(category).collection('items')
        
        # Use batch processing for efficiency
        batch = db.batch()
        batch_count = 0
        total_uploaded = 0
        
        for i, item in enumerate(articles):
            # Generate stable ID
            if item.get('type') == 'header':
                item_id = f"header_{i}"
            else:
                item_id = f"art_{item.get('number', i)}"
            
            item['index'] = i
            item['lawCategory'] = category
            item['lastUpdated'] = firestore.SERVER_TIMESTAMP
            
            doc_ref = items_ref.document(str(item_id))
            batch.set(doc_ref, item)
            
            batch_count += 1
            if batch_count >= 400:
                batch.commit()
                total_uploaded += batch_count
                print(f"   ⏳ Progress: {total_uploaded}/{len(articles)}")
                batch = db.batch()
                batch_count = 0
        
        if batch_count > 0:
            batch.commit()
            total_uploaded += batch_count
            
        print(f"✅ Finished: {title}")

def main():
    parser = argparse.ArgumentParser(description='Upload laws to Firebase Firestore')
    parser.add_argument('--file', help='Path to a specific JSON file')
    parser.add_argument('--all', action='store_true', help='Upload all *_full.json files in data/')
    
    args = parser.parse_args()
    
    if not os.path.exists(SERVICE_ACCOUNT_KEY):
        print(f"❌ Error: {SERVICE_ACCOUNT_KEY} not found.")
        return

    # Initialize Firebase
    cred = credentials.Certificate(SERVICE_ACCOUNT_KEY)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    if args.file:
        upload_file(db, args.file)
    elif args.all:
        for filename in os.listdir(DATA_DIR):
            if filename.endswith('_full.json'):
                upload_file(db, os.path.join(DATA_DIR, filename))
    else:
        parser.print_help()

if __name__ == "__main__":
    main()

"""
Create the 'troy-vault' bucket in Supabase Storage if it doesn't exist.

Usage (from backend/):
    source venv/bin/activate && python scripts/setup_storage.py

Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
BUCKET_NAME = "troy-vault"

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    sys.exit(1)

from supabase import create_client

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

try:
    sb.storage.get_bucket(BUCKET_NAME)
    print(f"  OK  Bucket '{BUCKET_NAME}' already exists")
except Exception:
    try:
        sb.storage.create_bucket(BUCKET_NAME, options={"public": True})
        print(f"  OK  Bucket '{BUCKET_NAME}' created (public=True)")
    except Exception as e:
        print(f"  FAIL  Could not create bucket '{BUCKET_NAME}': {e}")
        sys.exit(1)

print("\nDone. Storage bucket is ready.")

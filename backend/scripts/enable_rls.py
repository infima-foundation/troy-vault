"""
Enable Row Level Security on all troy-vault tables and create user-scoped policies.

Usage (from backend/):
    source venv/bin/activate && python scripts/enable_rls.py

Requires DATABASE_URL in .env.
The DATABASE_URL must connect as a superuser/service role to execute DDL.
The anon key cannot ALTER TABLE or CREATE POLICY.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

import psycopg2

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set in environment.")
    sys.exit(1)

STATEMENTS = [
    # Enable RLS
    ("Enable RLS on assets",        "ALTER TABLE assets ENABLE ROW LEVEL SECURITY"),
    ("Enable RLS on tags",          "ALTER TABLE tags ENABLE ROW LEVEL SECURITY"),
    ("Enable RLS on faces",         "ALTER TABLE faces ENABLE ROW LEVEL SECURITY"),
    ("Enable RLS on folders",       "ALTER TABLE folders ENABLE ROW LEVEL SECURITY"),
    ("Enable RLS on conversations", "ALTER TABLE conversations ENABLE ROW LEVEL SECURITY"),
    ("Enable RLS on messages",      "ALTER TABLE messages ENABLE ROW LEVEL SECURITY"),

    # Drop policies if they already exist (idempotent re-run)
    ("Drop old assets policy",        "DROP POLICY IF EXISTS users_own_assets ON assets"),
    ("Drop old tags policy",          "DROP POLICY IF EXISTS users_own_tags ON tags"),
    ("Drop old faces policy",         "DROP POLICY IF EXISTS users_own_faces ON faces"),
    ("Drop old folders policy",       "DROP POLICY IF EXISTS users_own_folders ON folders"),
    ("Drop old conversations policy", "DROP POLICY IF EXISTS users_own_conversations ON conversations"),
    ("Drop old messages policy",      "DROP POLICY IF EXISTS users_own_messages ON messages"),

    # Create policies
    ("Create assets policy", """
        CREATE POLICY "users_own_assets" ON assets
          FOR ALL USING (user_id = current_setting('app.user_id', true))
    """),
    ("Create tags policy", """
        CREATE POLICY "users_own_tags" ON tags
          FOR ALL USING (
            asset_id IN (
              SELECT id FROM assets
              WHERE user_id = current_setting('app.user_id', true)
            )
          )
    """),
    ("Create faces policy", """
        CREATE POLICY "users_own_faces" ON faces
          FOR ALL USING (
            asset_id IN (
              SELECT id FROM assets
              WHERE user_id = current_setting('app.user_id', true)
            )
          )
    """),
    ("Create folders policy", """
        CREATE POLICY "users_own_folders" ON folders
          FOR ALL USING (user_id = current_setting('app.user_id', true))
    """),
    ("Create conversations policy", """
        CREATE POLICY "users_own_conversations" ON conversations
          FOR ALL USING (user_id = current_setting('app.user_id', true))
    """),
    ("Create messages policy", """
        CREATE POLICY "users_own_messages" ON messages
          FOR ALL USING (
            conversation_id IN (
              SELECT id FROM conversations
              WHERE user_id = current_setting('app.user_id', true)
            )
          )
    """),
]


def main() -> None:
    print("Connecting to database...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        conn.autocommit = True
    except Exception as e:
        print(f"ERROR: Could not connect: {e}")
        sys.exit(1)

    cur = conn.cursor()
    passed = 0
    failed = 0

    for label, sql in STATEMENTS:
        try:
            cur.execute(sql)
            print(f"  OK  {label}")
            passed += 1
        except Exception as e:
            print(f"  FAIL {label}: {e}")
            failed += 1

    cur.close()
    conn.close()
    print(f"\nDone. Passed: {passed}  Failed: {failed}")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()

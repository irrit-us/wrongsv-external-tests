#!/usr/bin/env python3
"""
Pre-populate Hiddify's SQLite database with a local profile from a config file.

This enables "no other preparing" automated testing by creating a profile
entry directly in Hiddify's database, so the app finds it on startup.

Usage:
    python3 import-hiddify-config.py --config ./config.json
    python3 import-hiddify-config.py --config ./config.json --data-dir ~/.local/share/hiddify
"""

import argparse
import json
import os
import sqlite3
import sys
import uuid
from datetime import datetime, timezone


def get_data_dir():
    """Get the Hiddify data directory (matches path_provider on Linux)."""
    xdg_data = os.environ.get("XDG_DATA_HOME", os.path.expanduser("~/.local/share"))
    return os.path.join(xdg_data, "hiddify")


def main():
    parser = argparse.ArgumentParser(description="Import a config into Hiddify's database")
    parser.add_argument("--config", required=True, help="Path to the sing-box config file")
    parser.add_argument("--data-dir", default=None, help="Hiddify data directory")
    parser.add_argument("--profile-name", default="Test Profile", help="Profile display name")
    args = parser.parse_args()

    config_path = os.path.abspath(args.config)
    if not os.path.isfile(config_path):
        print(f"ERROR: Config file not found: {config_path}", file=sys.stderr)
        sys.exit(1)

    data_dir = args.data_dir or get_data_dir()
    configs_dir = os.path.join(data_dir, "configs")
    db_path = os.path.join(data_dir, "db.sqlite")

    # Read config content
    with open(config_path) as f:
        config_content = f.read()

    # Validate JSON if possible
    try:
        json.loads(config_content)
    except json.JSONDecodeError as e:
        print(f"WARNING: Config is not valid JSON: {e}", file=sys.stderr)
        print("Continuing anyway; Hiddify may reject it.", file=sys.stderr)

    # Generate profile ID
    profile_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    # Create directories
    os.makedirs(configs_dir, exist_ok=True)

    # Write config file to Hiddify's expected location
    config_dest = os.path.join(configs_dir, f"{profile_id}.json")
    with open(config_dest, "w") as f:
        f.write(config_content)
    print(f"Config written to: {config_dest}")

    # Open/create database
    db_exists = os.path.isfile(db_path)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    if not db_exists:
        print(f"Creating new database: {db_path}")
        # Create the profile_entries table with the schema Hiddify expects.
        # This matches Drift's generated schema from ProfileEntries.
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS profile_entries (
                id TEXT NOT NULL PRIMARY KEY,
                type TEXT NOT NULL DEFAULT 'local',
                active INTEGER NOT NULL DEFAULT 1,
                name TEXT NOT NULL,
                url TEXT,
                last_update TEXT NOT NULL,
                update_interval INTEGER,
                upload INTEGER,
                download INTEGER,
                total INTEGER,
                expire TEXT,
                web_page_url TEXT,
                support_url TEXT,
                populated_headers TEXT,
                user_override TEXT
            )
        """)
    else:
        print(f"Using existing database: {db_path}")

    # Deactivate all existing profiles
    cursor.execute("UPDATE profile_entries SET active = 0")

    # Check if a profile with this ID already exists
    cursor.execute("SELECT id FROM profile_entries WHERE id = ?", (profile_id,))
    existing = cursor.fetchone()

    if existing:
        cursor.execute(
            "UPDATE profile_entries SET active = 1, name = ?, last_update = ? WHERE id = ?",
            (args.profile_name, now, profile_id),
        )
        print(f"Updated existing profile: {profile_id}")
    else:
        cursor.execute(
            """INSERT INTO profile_entries
               (id, type, active, name, url, last_update, update_interval,
                upload, download, total, expire, web_page_url, support_url,
                populated_headers, user_override)
               VALUES (?, 'local', 1, ?, NULL, ?, NULL,
                       NULL, NULL, NULL, NULL, NULL, NULL,
                       NULL, NULL)""",
            (profile_id, args.profile_name, now),
        )
        print(f"Inserted new profile: {profile_id}")

    conn.commit()
    conn.close()

    # Verify
    print(f"\nDatabase ready: {db_path}")
    print(f"Profile '{args.profile_name}' (ID: {profile_id}) is active")
    print(f"\nTo start Hiddify with this config: ./scripts/start-proxy-app.sh --app hiddify --config {config_path}")


if __name__ == "__main__":
    main()

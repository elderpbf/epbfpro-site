#!/usr/bin/env python3
"""
extract-slide.py
================

Extract a single slide from a Google Slides deck into a brand new deck
that is shared as "anyone with the link, viewer", ready to embed in a
panel via /d/<id>/embed?rm=minimal.

Usage:
    python extract-slide.py <source-deck-id> <slide-number-1-indexed> [output-name]

Example:
    python extract-slide.py 1IlDUP2pjou4qww0zTbeZ5PO83T8tliZITnLYnM5SsYs 51 "Juntando tudo"

Caveat:
    The new deck is a SNAPSHOT. It does NOT auto-update when the source
    changes. If you need linked behavior, copy the slide via the Slides UI
    with "Keep linked to source".

First-run setup:
    pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib

    Create an OAuth 2.0 Client ID in Google Cloud Console:
        APIs & Services -> Credentials -> Create Credentials -> OAuth client ID
        Application type: Desktop app
    Download the JSON, save as `credentials.json` next to this script.
    First execution opens a browser for consent and caches the token in
    `token.json` (also next to this script). Both files are gitignored.

    Required APIs (enable in the same Cloud project):
        - Google Drive API
        - Google Slides API
"""

import sys
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/presentations',
]

SCRIPT_DIR = Path(__file__).resolve().parent
CREDENTIALS_PATH = SCRIPT_DIR / 'credentials.json'
TOKEN_PATH = SCRIPT_DIR / 'token.json'


def authenticate():
    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDENTIALS_PATH.exists():
                sys.exit(
                    f"[extract-slide] credentials.json not found at {CREDENTIALS_PATH}.\n"
                    "Download an OAuth client ID JSON (Desktop app type) from\n"
                    "Google Cloud Console -> APIs & Services -> Credentials."
                )
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_PATH), SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN_PATH.write_text(creds.to_json())
    return creds


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    source_id = sys.argv[1].strip()
    try:
        slide_number = int(sys.argv[2])
    except ValueError:
        sys.exit(f"[extract-slide] slide number must be an integer, got: {sys.argv[2]!r}")
    if slide_number < 1:
        sys.exit("[extract-slide] slide number must be 1 or greater")
    output_name = sys.argv[3].strip() if len(sys.argv) > 3 else f"Extracted slide {slide_number}"

    creds = authenticate()
    drive = build('drive', 'v3', credentials=creds)
    slides = build('slides', 'v1', credentials=creds)

    print(f"[extract-slide] copying source deck {source_id}...")
    copy = drive.files().copy(
        fileId=source_id,
        body={'name': output_name},
        fields='id,name',
    ).execute()
    new_id = copy['id']
    print(f"[extract-slide] new deck id: {new_id}")

    print("[extract-slide] reading new deck's slide list...")
    pres = slides.presentations().get(presentationId=new_id).execute()
    pages = pres.get('slides', [])
    if slide_number > len(pages):
        sys.exit(
            f"[extract-slide] slide {slide_number} out of range "
            f"(deck has {len(pages)} slides)"
        )
    target = pages[slide_number - 1]
    target_object_id = target['objectId']
    print(f"[extract-slide] keeping slide {slide_number} (objectId={target_object_id}); "
          f"deleting {len(pages) - 1} other(s)...")

    delete_requests = [
        {'deleteObject': {'objectId': page['objectId']}}
        for i, page in enumerate(pages)
        if i != slide_number - 1
    ]
    if delete_requests:
        slides.presentations().batchUpdate(
            presentationId=new_id,
            body={'requests': delete_requests},
        ).execute()

    print("[extract-slide] sharing as 'anyone with the link, viewer'...")
    drive.permissions().create(
        fileId=new_id,
        body={'type': 'anyone', 'role': 'reader'},
    ).execute()

    edit_url = f"https://docs.google.com/presentation/d/{new_id}/edit"
    embed_url = f"https://docs.google.com/presentation/d/{new_id}/embed?rm=minimal"
    print()
    print("[extract-slide] done.")
    print(f"  Edit URL:  {edit_url}")
    print(f"  Embed URL: {embed_url}")


if __name__ == '__main__':
    main()

# WhyMessenger 2.0
Discord-style messenger: nav rail, DM sidebar, search-first discovery, recent conversations, emoji + colour avatars, favicon. Stack: HTML, CSS, vanilla JS, Firebase Auth + Firestore (SDK 10.12.2). Free Spark plan; no Storage needed. Run with VS Code Live Server.

## Setup
1. Paste your Firebase config into `app.js`.
2. Firestore Database → Rules → replace everything with `firestore.rules` → **Publish** (required; without it Recent conversations and profile saving fail with "permission denied").
3. Open `index.html` with Live Server, hard-refresh (Ctrl+Shift+R).

## Behaviour
- No user directory is shown. Search by name or email (2+ characters, case-insensitive, matches anywhere) and click a result to open a chat; the chat document is created only then.
- Recent conversations lists chats you belong to (photo/avatar, name, last message, time). Older chats show "No messages yet" until a new message is sent.
- Profile dialog (bottom-left or gear): choose an emoji and colour, change display name; email is read-only.
- Signed-in users can see other users' name, email and avatar; messages are visible only to the two participants.

## Test checklist
Register → people list is empty → search a user → open chat → send messages in two browsers → refresh (history and Recent persist) → change avatar/name, log out/in → narrow window (<760px) for mobile layout → check tab icon.

## Limitations
Search loads up to 300 profiles and filters in the browser (fine for a prototype); no read receipts, message deletion or photo upload.

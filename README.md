# ChatLite — FastAPI Chat Website

ChatLite is a simple chat website built with FastAPI, SQLite, SQLAlchemy, and vanilla HTML/CSS/JavaScript. It is designed as a clean final-project MVP that runs locally and can be deployed to Render as a free web service.

## Features

- Register users with a username and display name
- List and search users
- Select a current user and chat partner
- Send and receive messages with HTTP polling every 2 seconds
- View full conversation history
- Search messages
- Show messages by conversation and by user through API endpoints
- Edit and soft-delete messages
- Fake online status indicators
- Profile initials/avatar circles
- Timestamps and edited labels
- Clean chat bubbles
- Dark mode with localStorage preference
- Responsive/mobile-friendly layout
- FastAPI `/docs` support for testing all API routes

## Tech Stack

- Python
- FastAPI
- SQLite
- SQLAlchemy
- Pydantic
- Uvicorn
- Vanilla HTML, CSS, and JavaScript

## Local Setup

1. Clone or download this project.
2. Open a terminal in the `chat-website` folder.
3. Create and activate a virtual environment:

```bash
python -m venv .venv
```

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

macOS/Linux:

```bash
source .venv/bin/activate
```

4. Install dependencies:

```bash
pip install -r requirements.txt
```

## How To Run

Start the development server:

```bash
uvicorn main:app --reload
```

Open the app:

```text
http://127.0.0.1:8000
```

Open the API docs:

```text
http://127.0.0.1:8000/docs
```

SQLite creates `chat.db` automatically when the app starts.

## API Overview

- `GET /api/health`
- `POST /api/users`
- `GET /api/users`
- `GET /api/users/search?q=`
- `GET /api/users/{user_id}`
- `POST /api/messages`
- `GET /api/messages`
- `GET /api/messages/search?q=`
- `GET /api/conversations/{user1_id}/{user2_id}`
- `GET /api/users/{user_id}/messages`
- `PATCH /api/messages/{message_id}`
- `DELETE /api/messages/{message_id}`

## Render Deployment

This project includes `render.yaml`, `runtime.txt`, and `requirements.txt` for Render.

Render settings:

- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Runtime: Python 3.11.9
- Service type: Web Service
- Plan: Free

Steps:

1. Upload this project to a public GitHub repository.
2. Create a new Render Web Service from that repository.
3. Use the included `render.yaml` or manually set the build/start commands above.
4. Deploy and open the Render URL.

Note: This demo uses SQLite for simplicity. Render free deployment may reset SQLite data after restart or redeploy, which is acceptable for demo purposes. For production, PostgreSQL is recommended.

## Live Website

Live website link: `PASTE_RENDER_LINK_HERE`

## Demo Video

YouTube demo video link: `PASTE_YOUTUBE_LINK_HERE`

## Screenshots

Add screenshots here:

- Home/chat screen
- User creation and search
- Message edit/delete
- FastAPI docs

import os
import time
import uuid
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.orm import Session

import crud
import models
import schemas
from database import Base, SessionLocal, engine, get_db


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

BOT_USERNAME = "chatbot"
BOT_DISPLAY_NAME = "ChatBot"
TYPING_TIMEOUT_SECONDS = 3
MAX_IMAGE_SIZE = 5 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}

typing_state: dict[tuple[int, int], dict[str, float | bool]] = {}


def ensure_database_schema():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        columns = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(messages)")).fetchall()
        }
        if "image_url" not in columns:
            connection.execute(text("ALTER TABLE messages ADD COLUMN image_url VARCHAR(255)"))
        if "message_type" not in columns:
            connection.execute(
                text("ALTER TABLE messages ADD COLUMN message_type VARCHAR(20) DEFAULT 'text' NOT NULL")
            )


def ensure_chatbot_user():
    db = SessionLocal()
    try:
        if not crud.get_user_by_username(db, BOT_USERNAME):
            crud.create_user(
                db,
                schemas.UserCreate(username=BOT_USERNAME, display_name=BOT_DISPLAY_NAME),
            )
    finally:
        db.close()


def rule_based_reply(text_value: str, for_bot: bool = False) -> str:
    text_lower = text_value.lower()
    if for_bot:
        if "hello" in text_lower or "hi" in text_lower:
            return "Hello! I am a simple chatbot for this demo."
        if "fastapi" in text_lower:
            return "FastAPI is a Python framework for building APIs quickly."
        if "translate" in text_lower:
            return "This app can translate messages using Google Cloud Translation API."
        if "project" in text_lower:
            return "This project is a chat website with users, messages, search, translation, and deployment."
        if "features" in text_lower:
            return "This app supports user management, messaging, search, dark mode, edit/delete messages, translation, and extra demo features."
        if "help" in text_lower:
            return "You can create users, select a chat partner, send messages, search messages, translate messages, and test the backend in /docs."
        return "I am a simple demo chatbot. Try asking about FastAPI, project, translate, features, or help."

    if "hello" in text_lower or "hi" in text_lower:
        return "Hey! How are you?"
    if "thanks" in text_lower or "thank you" in text_lower:
        return "You're welcome!"
    if "project" in text_lower:
        return "That sounds good, let me check it."
    if "help" in text_lower:
        return "Sure, what do you need help with?"
    if "bye" in text_lower:
        return "See you later!"
    return "Okay, sounds good!"


async def gemini_reply(prompt: str) -> str | None:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None

    model = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": (
                            "Give one short, friendly chat reply for this demo app. "
                            f"Message: {prompt}"
                        )
                    }
                ]
            }
        ]
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
        data = response.json()
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception:
        return None


ensure_database_schema()

app = FastAPI(
    title="ChatLite API",
    description="A simple FastAPI + SQLite chat website API.",
    version="1.0.0",
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.on_event("startup")
def startup_tasks():
    ensure_database_schema()
    ensure_chatbot_user()


@app.get("/")
def read_frontend():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.get("/api/translate")
async def translate_text(
    text: str = Query(..., min_length=1),
    target: str = Query(..., min_length=2),
    source: str = Query(default="auto"),
):
    api_key = os.getenv("GOOGLE_TRANSLATE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=400, detail="Translation API key is not configured.")

    payload = {
        "q": text,
        "target": target,
        "format": "text",
        "key": api_key,
    }
    if source and source != "auto":
        payload["source"] = source

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://translation.googleapis.com/language/translate/v2",
                data=payload,
            )
            response.raise_for_status()
        data = response.json()
        translated_text = data["data"]["translations"][0]["translatedText"]
        detected_source = data["data"]["translations"][0].get("detectedSourceLanguage", source)
        return {
            "translated_text": translated_text,
            "target": target,
            "source": detected_source,
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Translation failed. Please try again later.")


@app.post("/api/ai/suggest")
async def suggest_reply(request: schemas.AISuggestionRequest):
    suggestion = await gemini_reply(request.last_message)
    source = "gemini"
    if not suggestion:
        suggestion = rule_based_reply(request.last_message)
        source = "rules"
    return {"suggestion": suggestion, "source": source}


@app.get("/api/ai/status")
def ai_status():
    return {
        "gemini_configured": bool(os.getenv("GEMINI_API_KEY")),
        "gemini_model": os.getenv("GEMINI_MODEL", "gemini-flash-latest"),
        "fallback": "rules",
    }


@app.post("/api/upload-image")
async def upload_image(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, WebP, or GIF images are allowed.")

    contents = await file.read()
    if len(contents) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="Image must be 5 MB or smaller.")

    extension = ALLOWED_IMAGE_TYPES[file.content_type]
    filename = f"{uuid.uuid4().hex}{extension}"
    file_path = UPLOAD_DIR / filename
    file_path.write_bytes(contents)
    return {"image_url": f"/uploads/{filename}"}


@app.post("/api/typing")
def update_typing_state(update: schemas.TypingUpdate, db: Session = Depends(get_db)):
    if not crud.get_user(db, update.sender_id):
        raise HTTPException(status_code=404, detail="Sender not found.")
    if not crud.get_user(db, update.receiver_id):
        raise HTTPException(status_code=404, detail="Receiver not found.")

    typing_state[(update.sender_id, update.receiver_id)] = {
        "is_typing": update.is_typing,
        "updated_at": time.time(),
    }
    return {"status": "ok"}


@app.get("/api/typing/{user1_id}/{user2_id}")
def get_typing_state(
    user1_id: int,
    user2_id: int,
    viewer_id: int = Query(...),
):
    if viewer_id not in {user1_id, user2_id}:
        raise HTTPException(status_code=400, detail="Viewer must be part of the conversation.")

    other_id = user2_id if viewer_id == user1_id else user1_id
    state = typing_state.get((other_id, viewer_id))
    is_typing = False
    if state:
        is_fresh = time.time() - float(state["updated_at"]) <= TYPING_TIMEOUT_SECONDS
        is_typing = bool(state["is_typing"]) and is_fresh
        if not is_fresh:
            typing_state.pop((other_id, viewer_id), None)

    return {"is_typing": is_typing, "user_id": other_id}


@app.post("/api/users", response_model=schemas.UserRead, status_code=201)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    username = crud.clean_text(user.username)
    display_name = crud.clean_text(user.display_name)

    if not username or not display_name:
        raise HTTPException(status_code=400, detail="Username and display name are required.")
    if crud.get_user_by_username(db, username):
        raise HTTPException(status_code=400, detail="Username already exists.")

    return crud.create_user(
        db,
        schemas.UserCreate(username=username, display_name=display_name),
    )


@app.get("/api/users", response_model=list[schemas.UserRead])
def list_users(db: Session = Depends(get_db)):
    return crud.list_users(db)


@app.get("/api/users/search", response_model=list[schemas.UserRead])
def search_users(q: str = Query(default=""), db: Session = Depends(get_db)):
    if not q.strip():
        return crud.list_users(db)
    return crud.search_users(db, q)


@app.get("/api/users/{user_id}", response_model=schemas.UserRead)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = crud.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


@app.post("/api/messages", response_model=schemas.MessageRead, status_code=201)
async def create_message(message: schemas.MessageCreate, db: Session = Depends(get_db)):
    content = crud.clean_text(message.content)
    message_type = message.message_type if message.message_type in {"text", "image"} else "text"
    image_url = message.image_url if message.image_url else None
    if not content and not image_url:
        raise HTTPException(status_code=400, detail="Message content or image is required.")
    if message_type == "image" and not image_url:
        raise HTTPException(status_code=400, detail="Image URL is required for image messages.")
    if message.sender_id == message.receiver_id:
        raise HTTPException(status_code=400, detail="Choose a different chat partner.")
    sender = crud.get_user(db, message.sender_id)
    receiver = crud.get_user(db, message.receiver_id)
    if not sender:
        raise HTTPException(status_code=404, detail="Sender not found.")
    if not receiver:
        raise HTTPException(status_code=404, detail="Receiver not found.")

    saved_message = crud.create_message(
        db,
        schemas.MessageCreate(
            sender_id=message.sender_id,
            receiver_id=message.receiver_id,
            content=content,
            image_url=image_url,
            message_type=message_type,
        ),
    )

    if receiver.username == BOT_USERNAME and sender.username != BOT_USERNAME:
        bot_text = await gemini_reply(content) or rule_based_reply(content, for_bot=True)
        crud.create_message(
            db,
            schemas.MessageCreate(
                sender_id=receiver.id,
                receiver_id=sender.id,
                content=bot_text,
                message_type="text",
            ),
        )

    return saved_message


@app.get("/api/messages", response_model=list[schemas.MessageRead])
def list_messages(db: Session = Depends(get_db)):
    return crud.list_messages(db)


@app.get("/api/messages/search", response_model=list[schemas.MessageRead])
def search_messages(q: str = Query(default=""), db: Session = Depends(get_db)):
    if not q.strip():
        return crud.list_messages(db)
    return crud.search_messages(db, q)


@app.get("/api/conversations/{user1_id}/{user2_id}", response_model=list[schemas.MessageRead])
def get_conversation(user1_id: int, user2_id: int, db: Session = Depends(get_db)):
    if not crud.get_user(db, user1_id):
        raise HTTPException(status_code=404, detail="First user not found.")
    if not crud.get_user(db, user2_id):
        raise HTTPException(status_code=404, detail="Second user not found.")
    return crud.get_conversation(db, user1_id, user2_id)


@app.get("/api/users/{user_id}/messages", response_model=list[schemas.MessageRead])
def get_user_messages(user_id: int, db: Session = Depends(get_db)):
    if not crud.get_user(db, user_id):
        raise HTTPException(status_code=404, detail="User not found.")
    return crud.get_user_messages(db, user_id)


@app.patch("/api/messages/{message_id}", response_model=schemas.MessageRead)
def update_message(
    message_id: int,
    message: schemas.MessageUpdate,
    db: Session = Depends(get_db),
):
    content = crud.clean_text(message.content)
    if not content:
        raise HTTPException(status_code=400, detail="Message content cannot be empty.")

    existing_message = crud.get_message(db, message_id)
    if not existing_message or existing_message.is_deleted:
        raise HTTPException(status_code=404, detail="Message not found.")

    return crud.update_message(db, message_id, content)


@app.delete("/api/messages/{message_id}")
def delete_message(message_id: int, db: Session = Depends(get_db)):
    existing_message = crud.get_message(db, message_id)
    if not existing_message or existing_message.is_deleted:
        raise HTTPException(status_code=404, detail="Message not found.")

    crud.delete_message(db, message_id)
    return {"status": "deleted"}

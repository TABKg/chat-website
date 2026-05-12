from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

import crud
import models
import schemas
from database import Base, engine, get_db


Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="ChatLite API",
    description="A simple FastAPI + SQLite chat website API.",
    version="1.0.0",
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def read_frontend():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


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
def create_message(message: schemas.MessageCreate, db: Session = Depends(get_db)):
    content = crud.clean_text(message.content)
    if not content:
        raise HTTPException(status_code=400, detail="Message content cannot be empty.")
    if message.sender_id == message.receiver_id:
        raise HTTPException(status_code=400, detail="Choose a different chat partner.")
    if not crud.get_user(db, message.sender_id):
        raise HTTPException(status_code=404, detail="Sender not found.")
    if not crud.get_user(db, message.receiver_id):
        raise HTTPException(status_code=404, detail="Receiver not found.")

    return crud.create_message(
        db,
        schemas.MessageCreate(
            sender_id=message.sender_id,
            receiver_id=message.receiver_id,
            content=content,
        ),
    )


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

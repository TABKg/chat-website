from datetime import datetime

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

import models
import schemas


def clean_text(value: str) -> str:
    return value.strip()


def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()


def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()


def create_user(db: Session, user: schemas.UserCreate):
    db_user = models.User(
        username=clean_text(user.username),
        display_name=clean_text(user.display_name),
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def list_users(db: Session):
    return db.query(models.User).order_by(models.User.display_name.asc()).all()


def search_users(db: Session, query: str):
    pattern = f"%{query.strip()}%"
    return (
        db.query(models.User)
        .filter(
            or_(
                models.User.username.ilike(pattern),
                models.User.display_name.ilike(pattern),
            )
        )
        .order_by(models.User.display_name.asc())
        .all()
    )


def message_query(db: Session):
    return db.query(models.Message).options(
        joinedload(models.Message.sender),
        joinedload(models.Message.receiver),
    )


def create_message(db: Session, message: schemas.MessageCreate):
    db_message = models.Message(
        sender_id=message.sender_id,
        receiver_id=message.receiver_id,
        content=clean_text(message.content),
        image_url=message.image_url,
        message_type=message.message_type,
    )
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    return (
        message_query(db)
        .filter(models.Message.id == db_message.id)
        .first()
    )


def list_messages(db: Session):
    return (
        message_query(db)
        .filter(models.Message.is_deleted.is_(False))
        .order_by(models.Message.created_at.asc())
        .all()
    )


def search_messages(db: Session, query: str):
    pattern = f"%{query.strip()}%"
    return (
        message_query(db)
        .filter(
            models.Message.is_deleted.is_(False),
            models.Message.content.ilike(pattern),
        )
        .order_by(models.Message.created_at.asc())
        .all()
    )


def get_conversation(db: Session, user1_id: int, user2_id: int):
    return (
        message_query(db)
        .filter(
            models.Message.is_deleted.is_(False),
            or_(
                and_(
                    models.Message.sender_id == user1_id,
                    models.Message.receiver_id == user2_id,
                ),
                and_(
                    models.Message.sender_id == user2_id,
                    models.Message.receiver_id == user1_id,
                ),
            ),
        )
        .order_by(models.Message.created_at.asc())
        .all()
    )


def get_user_messages(db: Session, user_id: int):
    return (
        message_query(db)
        .filter(
            models.Message.is_deleted.is_(False),
            or_(
                models.Message.sender_id == user_id,
                models.Message.receiver_id == user_id,
            ),
        )
        .order_by(models.Message.created_at.asc())
        .all()
    )


def get_message(db: Session, message_id: int):
    return (
        message_query(db)
        .filter(models.Message.id == message_id)
        .first()
    )


def update_message(db: Session, message_id: int, content: str):
    db_message = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not db_message:
        return None

    db_message.content = clean_text(content)
    db_message.edited_at = datetime.utcnow()
    db.commit()
    return get_message(db, message_id)


def delete_message(db: Session, message_id: int):
    db_message = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not db_message:
        return None

    db_message.is_deleted = True
    db.commit()
    return get_message(db, message_id)

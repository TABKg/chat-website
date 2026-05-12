from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserCreate(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    display_name: str = Field(..., min_length=1, max_length=100)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str
    created_at: datetime
    is_online: bool


class MessageCreate(BaseModel):
    sender_id: int
    receiver_id: int
    content: str = Field(..., min_length=1)


class MessageUpdate(BaseModel):
    content: str = Field(..., min_length=1)


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sender_id: int
    receiver_id: int
    content: str
    created_at: datetime
    edited_at: datetime | None
    is_deleted: bool
    sender: UserRead
    receiver: UserRead

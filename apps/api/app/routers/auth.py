from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


@router.post("/login", response_model=TokenOut)
async def login(_: LoginIn):
    # TODO(sprint-1): look the user up, verify_password, issue create_access_token.
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "wired in sprint 1")

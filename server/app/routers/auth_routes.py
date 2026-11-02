from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, select

from ..auth import get_current_user, hash_password, issue_token, revoke_token, verify_password
from ..db import get_session
from ..models import User
from ..ratelimit import check_rate_limit

router = APIRouter(prefix="/auth", tags=["auth"])


class Credentials(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user_id: str
    username: str
    avatar_updated_at: str | None = None  # 有值 = 有自定义头像(ISO 时间戳,兼作缓存指纹)


@router.post("/register")
def register(
    body: Credentials, request: Request, session: Session = Depends(get_session)
) -> AuthResponse:
    # 注册接口公网开放且持续被扫:按来源 IP 限 5 个/小时,挡脚本批量开号
    # (每个号都能拿到化身对话的 LLM 配额)
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"register:{client_ip}", max_calls=5, window_seconds=3600)
    username = body.username.strip()
    if not (2 <= len(username) <= 20):
        raise HTTPException(status_code=422, detail="用户名需 2~20 个字符")
    if len(body.password) < 6:
        raise HTTPException(status_code=422, detail="密码至少 6 位")
    if session.exec(select(User).where(User.username == username)).first():
        raise HTTPException(status_code=409, detail="用户名已被占用")
    user = User(username=username, password_hash=hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return AuthResponse(token=issue_token(session, user), user_id=user.id, username=user.username)


@router.post("/login")
def login(
    body: Credentials, request: Request, session: Session = Depends(get_session)
) -> AuthResponse:
    # 按来源 IP 限暴力试密码:10 次/10 分钟
    client_ip = request.client.host if request.client else "unknown"
    check_rate_limit(f"login:{client_ip}", max_calls=10, window_seconds=600)
    user = session.exec(select(User).where(User.username == body.username.strip())).first()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    return AuthResponse(
        token=issue_token(session, user),
        user_id=user.id,
        username=user.username,
        avatar_updated_at=user.avatar_updated_at.isoformat() if user.avatar_updated_at else None,
    )


@router.post("/logout")
def logout(request: Request, session: Session = Depends(get_session)) -> dict:
    revoke_token(request, session)
    return {"ok": True}


class UserInfo(BaseModel):
    id: str
    username: str


@router.get("/me")
def me(user: User = Depends(get_current_user)) -> UserInfo:
    return UserInfo(id=user.id, username=user.username)

"""用户发现与资料:状态、对外形象、账号(改名/改密/头像/注销)。"""

import base64
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session, func, or_, select

from .. import recommend as rec
from ..auth import get_current_user, hash_password, verify_password
from ..config import AVATAR_DIR
from ..db import get_session
from ..models import (
    AuthToken,
    ChatMessage,
    DialoguePair,
    DiaryAllowedUser,
    DiaryEntry,
    DirectMessage,
    MatchReport,
    PersonaCard,
    User,
)
from ..ratelimit import check_rate_limit

router = APIRouter(prefix="/users", tags=["users"])

STATUS_TTL = timedelta(hours=24)

# 对外形象上限。够写「我是谁 / 在意什么 / 希望怎么聊 / 不想聊什么」四段,
# 又不至于长到把 system prompt 挤成一篇自传(每轮对话都要带上它)
MAX_PERSONA_CHARS = 600
# 列表页摘要长度:一行能放下的量
PERSONA_EXCERPT_CHARS = 60

# 头像文件落在数据目录(与 agentdiary.db 同级),部署时随 AGENTDIARY_DATA_DIR
# 一起外置;时间戳存在 User.avatar_updated_at
MAX_AVATAR_BYTES = 8 * 1024 * 1024


def current_status(user: User) -> str | None:
    """未过期的状态文本;超过 24 小时视为过期(微信状态式)。"""
    if not user.status_text or user.status_updated_at is None:
        return None
    updated = user.status_updated_at
    if updated.tzinfo is None:  # SQLite 存的是 naive UTC
        updated = updated.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - updated > STATUS_TTL:
        return None
    return user.status_text


def persona_excerpt(user: User) -> str | None:
    """对外形象的单行摘要,给列表页用。"""
    if not user.public_persona:
        return None
    one_line = " ".join(user.public_persona.split())
    if len(one_line) <= PERSONA_EXCERPT_CHARS:
        return one_line
    return one_line[: PERSONA_EXCERPT_CHARS - 1].rstrip() + "…"


class UserSummary(BaseModel):
    id: str
    username: str
    card_count: int  # 化身被喂养的程度,给访客一个预期
    is_builtin: bool  # 内置名人化身
    status: str | None  # 当前有效状态
    avatar_updated_at: datetime | None  # 有值 = 有自定义头像,兼作缓存指纹
    persona_excerpt: str | None = None  # 对外形象首行摘要;None = 还没写
    tags: list[str] = []  # 兴趣标签(LLM 提炼或种子给定)
    reason: str | None = None  # 推荐理由;只有推荐接口会填
    last_message: str | None = None  # 最近对话预览;只有「最近对话」接口会填
    last_at: datetime | None = None


class UserProfile(BaseModel):
    """访问某个化身前后看到的资料页:对外形象全文在这里。"""

    id: str
    username: str
    is_builtin: bool
    card_count: int
    status: str | None
    persona: str | None
    avatar_updated_at: datetime | None
    tags: list[str] = []
    # 是否可能解锁真人对话:名人化身与种子账号背后没有真人,客户端据此隐藏裁判入口
    accepts_real_chat: bool = True


def _summary(user: User, counts: dict[str, int], **extra) -> UserSummary:
    return UserSummary(
        id=user.id,
        username=user.username,
        card_count=counts.get(user.id, 0),
        is_builtin=user.is_builtin,
        status=current_status(user),
        avatar_updated_at=user.avatar_updated_at,
        persona_excerpt=persona_excerpt(user),
        tags=rec.parse_tags(user.tags_json),
        **extra,
    )


class StatusUpdate(BaseModel):
    status: str | None  # None 或空串 = 清除状态


@router.put("/me/status")
def set_status(
    body: StatusUpdate,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    text = (body.status or "").strip()
    if len(text) > 50:
        raise HTTPException(status_code=422, detail="状态最多 50 字")
    me.status_text = text or None
    me.status_updated_at = datetime.now(timezone.utc) if text else None
    session.add(me)
    session.commit()
    return {"status": text or None}


@router.get("/me/status")
def get_my_status(me: User = Depends(get_current_user)) -> dict:
    return {"status": current_status(me)}


class PersonaUpdate(BaseModel):
    persona: str | None  # None 或空串 = 清除


class PersonaOut(BaseModel):
    persona: str | None
    updated_at: datetime | None
    max_chars: int = MAX_PERSONA_CHARS


@router.get("/me/persona")
def get_my_persona(me: User = Depends(get_current_user)) -> PersonaOut:
    return PersonaOut(persona=me.public_persona, updated_at=me.persona_updated_at)


@router.put("/me/persona")
def set_persona(
    body: PersonaUpdate,
    background_tasks: BackgroundTasks,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> PersonaOut:
    """写/改对外形象。

    这段话会原样展示给来访的用户,并注入化身的 system prompt。它只影响化身
    「怎么说、先说什么、避开什么」;「说的是不是事实」仍由人格卡片兜底。
    """
    check_rate_limit(f"persona:{me.id}", max_calls=30, window_seconds=3600)
    if me.is_builtin:
        raise HTTPException(status_code=403, detail="内置化身不可修改")
    text = (body.persona or "").strip()
    if len(text) > MAX_PERSONA_CHARS:
        raise HTTPException(status_code=422, detail=f"对外形象最多 {MAX_PERSONA_CHARS} 字")
    me.public_persona = text or None
    me.persona_updated_at = datetime.now(timezone.utc) if text else None
    session.add(me)
    session.commit()
    # 对外形象变了,兴趣标签跟着重提炼(后台,失败不影响保存)
    background_tasks.add_task(rec.refresh_user_tags_by_id, me.id)
    return PersonaOut(persona=me.public_persona, updated_at=me.persona_updated_at)


class PasswordChange(BaseModel):
    old_password: str
    new_password: str


class UsernameChange(BaseModel):
    username: str


class AvatarUpload(BaseModel):
    image_base64: str


@router.put("/me/password")
def change_password(
    body: PasswordChange,
    request: Request,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    check_rate_limit(f"pwchange:{me.id}", max_calls=5, window_seconds=3600)
    if not verify_password(body.old_password, me.password_hash):
        raise HTTPException(status_code=403, detail="当前密码不对")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=422, detail="新密码至少 6 位")
    me.password_hash = hash_password(body.new_password)
    session.add(me)
    # 吊销其他设备的 token,当前会话保留(改密后旧登录一律作废)
    current = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    for t in session.exec(select(AuthToken).where(AuthToken.user_id == me.id)):
        if t.token != current:
            session.delete(t)
    session.commit()
    return {"ok": True}


@router.put("/me/username")
def change_username(
    body: UsernameChange,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    username = body.username.strip()
    if not (2 <= len(username) <= 20):
        raise HTTPException(status_code=422, detail="用户名需 2~20 个字符")
    if username != me.username:
        if session.exec(select(User).where(User.username == username)).first():
            raise HTTPException(status_code=409, detail="用户名已被占用")
        me.username = username
        session.add(me)
        session.commit()
    return {"username": username}


class AccountDeletion(BaseModel):
    password: str


@router.delete("/me")
def delete_account(
    body: AccountDeletion,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """注销账号,连带删除全部衍生数据。

    Apple 审核指南 5.1.1(v) 要求可在 App 内自助注销;PIPL 的删除权同理。
    要求重输密码:token 被盗时不该能一键抹掉别人所有数据。

    删除范围对齐 CLAUDE.md §5「用户删除日记 → 级联删除衍生的对话对与人格
    卡片」,只是把粒度提到账号级。头像文件也一并删,否则数据没了文件还在。
    """
    check_rate_limit(f"delacct:{me.id}", max_calls=5, window_seconds=3600)
    if me.is_builtin:
        raise HTTPException(status_code=403, detail="内置化身账号不可注销")
    if not verify_password(body.password, me.password_hash):
        raise HTTPException(status_code=403, detail="密码不对")

    uid = me.id
    # 先删日记的从属表(DiaryAllowedUser 挂在 diary 上,不是 user 上)
    my_diaries = [d.id for d in session.exec(select(DiaryEntry).where(DiaryEntry.user_id == uid))]
    if my_diaries:
        for allow in session.exec(
            select(DiaryAllowedUser).where(DiaryAllowedUser.diary_id.in_(my_diaries))  # type: ignore[attr-defined]
        ):
            session.delete(allow)
    # 他人日记对我的授权也要撤销
    for allow in session.exec(select(DiaryAllowedUser).where(DiaryAllowedUser.user_id == uid)):
        session.delete(allow)

    for model, columns in (
        (AuthToken, (AuthToken.user_id,)),
        (PersonaCard, (PersonaCard.user_id,)),
        (DialoguePair, (DialoguePair.user_id,)),
        (DiaryEntry, (DiaryEntry.user_id,)),
        # 双向的:我的化身被访问的记录、我访问别人化身的记录,都是我的数据
        (ChatMessage, (ChatMessage.agent_owner_id, ChatMessage.visitor_id)),
        (MatchReport, (MatchReport.owner_id, MatchReport.visitor_id)),
        (DirectMessage, (DirectMessage.sender_id, DirectMessage.recipient_id)),
    ):
        for col in columns:
            for row in session.exec(select(model).where(col == uid)):  # type: ignore[arg-type]
                session.delete(row)

    session.delete(me)
    session.commit()

    # 库删干净了再删文件:反过来的话中途失败会留下有记录无文件的悬空状态
    avatar = AVATAR_DIR / f"{uid}.img"
    if avatar.exists():
        avatar.unlink()

    return {"deleted": uid}


@router.put("/me/avatar")
def upload_avatar(
    body: AvatarUpload,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    check_rate_limit(f"avatar:{me.id}", max_calls=10, window_seconds=3600)
    try:
        raw = base64.b64decode(body.image_base64, validate=True)
    except Exception:
        raise HTTPException(status_code=422, detail="图片数据无效")
    if len(raw) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=422, detail="图片太大(上限 8MB)")
    if not (raw[:3] == b"\xff\xd8\xff" or raw[:8] == b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(status_code=422, detail="仅支持 JPG/PNG")
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    (AVATAR_DIR / f"{me.id}.img").write_bytes(raw)
    me.avatar_updated_at = datetime.now(timezone.utc)
    session.add(me)
    session.commit()
    return {"avatar_updated_at": me.avatar_updated_at}


@router.get("/{user_id}/avatar")
def get_avatar(user_id: str):
    """头像文件。不鉴权:RN Image 带自定义头不方便,uuid 路径本身不可猜;
    头像非高敏数据(隐私红线只覆盖日记及衍生物)。"""
    path = AVATAR_DIR / f"{user_id}.img"
    if not path.exists():
        raise HTTPException(status_code=404, detail="没有头像")
    with path.open("rb") as f:
        head = f.read(8)
    media = "image/png" if head == b"\x89PNG\r\n\x1a\n" else "image/jpeg"
    return FileResponse(path, media_type=media)


@router.get("/{user_id}/profile")
def get_profile(
    user_id: str,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserProfile:
    """化身资料页:访客在这里读到对方亲自写的对外形象全文。自己看自己也走这里。"""
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    count = session.exec(
        select(func.count())
        .select_from(PersonaCard)
        .where(PersonaCard.user_id == user.id)
        .where(PersonaCard.superseded_by == None)  # noqa: E711
    ).one()
    return UserProfile(
        id=user.id,
        username=user.username,
        is_builtin=user.is_builtin,
        card_count=int(count),
        status=current_status(user),
        persona=user.public_persona,
        avatar_updated_at=user.avatar_updated_at,
        tags=rec.parse_tags(user.tags_json),
        accepts_real_chat=not (user.is_builtin or user.is_seed),
    )


MAX_SEARCH = 20


@router.get("/search")
def search_users(
    q: str = "",
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[UserSummary]:
    """按用户名搜索(不分大小写的包含匹配),最多 20 条。发现页不再罗列全员,
    想找具体的人就搜;空查询返回空。"""
    q = q.strip()
    if not q:
        return []
    if len(q) > 20:
        raise HTTPException(status_code=422, detail="关键词太长")
    check_rate_limit(f"usearch:{me.id}", max_calls=120, window_seconds=3600)
    counts = rec.card_counts(session)
    pattern = f"%{q.lower()}%"
    rows = session.exec(
        select(User)
        .where(User.id != me.id)
        .where(func.lower(User.username).like(pattern))
        .order_by(User.username)
        .limit(MAX_SEARCH)
    )
    result = [_summary(u, counts) for u in rows]
    # 名字开头就命中的排前面
    result.sort(key=lambda u: (not u.username.lower().startswith(q.lower()), u.is_builtin, u.username))
    return result


@router.get("/recommended")
def recommended_users(
    limit: int = 8,
    tag: str | None = None,
    seed: int = 0,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[UserSummary]:
    """为你推荐:按兴趣标签重合 + 资料完整度 + 活跃度打分,带可验证的推荐理由。
    seed 换一批;tag 只看带该标签的人。"""
    limit = max(1, min(limit, 20))
    counts = rec.card_counts(session)
    picked = rec.recommend(session, me, limit=limit, tag=(tag or "").strip() or None, seed=seed)
    return [_summary(u, counts, reason=reason) for u, _score, reason, _tags, _cards in picked]


class TagCount(BaseModel):
    tag: str
    count: int


@router.get("/tags")
def tags(
    me: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> list[TagCount]:
    """筛选条用的热门标签。"""
    return [TagCount(tag=t, count=n) for t, n in rec.popular_tags(session)]


@router.get("/recent")
def recent_contacts(
    limit: int = 20,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[UserSummary]:
    """最近和哪些化身聊过(按最后一条消息时间),带最后一句预览。"""
    limit = max(1, min(limit, 50))
    rows = session.exec(
        select(ChatMessage.agent_owner_id, func.max(ChatMessage.created_at))
        .where(ChatMessage.visitor_id == me.id)
        .where(ChatMessage.agent_owner_id != me.id)
        .group_by(ChatMessage.agent_owner_id)
        .order_by(func.max(ChatMessage.created_at).desc())
        .limit(limit)
    ).all()
    counts = rec.card_counts(session)
    out: list[UserSummary] = []
    for owner_id, last_at in rows:
        owner = session.get(User, owner_id)
        if owner is None:
            continue
        last = session.exec(
            select(ChatMessage)
            .where(ChatMessage.agent_owner_id == owner_id)
            .where(ChatMessage.visitor_id == me.id)
            .order_by(ChatMessage.created_at.desc())  # type: ignore[attr-defined]
            .limit(1)
        ).first()
        out.append(
            _summary(
                owner,
                counts,
                last_message=last.content if last else None,
                last_at=last_at,
            )
        )
    return out


@router.get("")
def list_users(
    me: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> list[UserSummary]:
    """发现页的「门面」:只返回名人化身和我聊过的人,不再罗列全站用户
    (隐私:注册即被所有人看到不合理;找人走搜索,认识新人走推荐)。"""
    counts = rec.card_counts(session)
    talked = {
        row
        for row in session.exec(
            select(ChatMessage.agent_owner_id).where(ChatMessage.visitor_id == me.id).distinct()
        )
    }
    rows = session.exec(
        select(User).where(User.id != me.id).where(or_(User.is_builtin == True, User.id.in_(talked)))  # noqa: E712
    )
    result = [_summary(u, counts) for u in rows]
    result.sort(key=lambda u: (not u.is_builtin, u.username))
    return result

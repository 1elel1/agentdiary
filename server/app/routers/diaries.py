from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, func, select

from ..auth import get_current_user
from ..db import get_session
from ..distill.pipeline import run_pipeline_for_diary
from ..ratelimit import check_rate_limit
from ..models import DialoguePair, DiaryAllowedUser, DiaryEntry, PersonaCard, User

router = APIRouter(prefix="/diaries", tags=["diaries"])

VISIBILITIES = {"public", "restricted", "private"}
# 落笔 24 小时内可修改内容,之后定格(产品约定:不可篡改保证日记真实性)
EDIT_WINDOW = timedelta(hours=24)


def _within_edit_window(diary: DiaryEntry) -> bool:
    created = diary.created_at
    if created.tzinfo is None:  # SQLite 存 naive UTC
        created = created.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - created <= EDIT_WINDOW


class DiaryCreate(BaseModel):
    content: str
    # public=化身可对所有人透露 / restricted=仅指定用户 / private=仅自己。默认私密
    visibility: str = "private"
    allowed_user_ids: list[str] = []
    # False = 只保存不用于化身(客户端在识别到粘贴/转载内容时让用户选)
    use_for_twin: bool = True


class DiaryOut(BaseModel):
    """日记 + 衍生卡片数(删除确认时告诉用户会一并删掉几条理解)。"""

    id: str
    content: str
    visibility: str
    locked: bool
    use_for_twin: bool
    created_at: datetime
    updated_at: datetime
    card_count: int = 0


def _card_counts(session: Session, user_id: str) -> dict[str, int]:
    rows = session.exec(
        select(PersonaCard.source_diary_id, func.count())
        .where(PersonaCard.user_id == user_id)
        .where(PersonaCard.superseded_by == None)  # noqa: E711
        .group_by(PersonaCard.source_diary_id)
    ).all()
    return {did: int(n) for did, n in rows}


def _out(diary: DiaryEntry, card_count: int = 0) -> DiaryOut:
    return DiaryOut(
        id=diary.id,
        content=diary.content,
        visibility=diary.visibility,
        locked=diary.locked,
        use_for_twin=diary.use_for_twin,
        created_at=diary.created_at,
        updated_at=diary.updated_at,
        card_count=card_count,
    )


def _purge_derived(session: Session, diary_id: str) -> int:
    """删掉一篇日记的全部衍生物(对话对 + 卡片)。返回删掉的卡片数。"""
    n = 0
    for pair in session.exec(select(DialoguePair).where(DialoguePair.source_diary_id == diary_id)):
        session.delete(pair)
    for card in session.exec(select(PersonaCard).where(PersonaCard.source_diary_id == diary_id)):
        session.delete(card)
        n += 1
    return n


@router.get("")
def list_diaries(
    me: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> list[DiaryOut]:
    stmt = (
        select(DiaryEntry)
        .where(DiaryEntry.user_id == me.id)
        .order_by(DiaryEntry.created_at.desc())  # type: ignore[attr-defined]
    )
    counts = _card_counts(session, me.id)
    return [_out(d, counts.get(d.id, 0)) for d in session.exec(stmt)]


@router.post("")
def create_diary(
    body: DiaryCreate,
    background_tasks: BackgroundTasks,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> DiaryOut:
    # 每篇日记都会触发多次 LLM 蒸馏,限 20 篇/天防滥用
    check_rate_limit(f"diary:{me.id}", max_calls=20, window_seconds=86400)
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="日记内容不能为空")
    if body.visibility not in VISIBILITIES:
        raise HTTPException(status_code=422, detail="可见性取值不合法")
    diary = DiaryEntry(
        user_id=me.id, content=content, visibility=body.visibility, use_for_twin=body.use_for_twin
    )
    session.add(diary)
    session.commit()
    session.refresh(diary)
    if body.visibility == "restricted":
        for uid in set(body.allowed_user_ids):
            session.add(DiaryAllowedUser(diary_id=diary.id, user_id=uid))
        session.commit()
    # 蒸馏在后台异步执行,不阻塞保存;「不用于化身」的日记只保存
    if diary.use_for_twin:
        background_tasks.add_task(run_pipeline_for_diary, diary.id)
    return _out(diary)


def _owned_diary(diary_id: str, me: User, session: Session) -> DiaryEntry:
    diary = session.get(DiaryEntry, diary_id)
    if diary is None or diary.user_id != me.id:
        # 不区分「不存在」与「不是你的」,避免泄露他人日记 id 的存在性
        raise HTTPException(status_code=404, detail="日记不存在")
    return diary


class VisibilityUpdate(BaseModel):
    # 不传 = 不改可见性
    visibility: str | None = None
    # 传了就整体替换白名单;不传则保持原样
    allowed_user_ids: list[str] | None = None
    # 手势锁标记(独立于可见性)
    locked: bool | None = None
    # 训练闸门:关掉 = 清空衍生物且不再蒸馏;打开 = 重新蒸馏
    use_for_twin: bool | None = None


@router.patch("/{diary_id}")
def update_visibility(
    diary_id: str,
    body: VisibilityUpdate,
    background_tasks: BackgroundTasks,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> DiaryOut:
    diary = _owned_diary(diary_id, me, session)
    if body.visibility is not None:
        if body.visibility not in VISIBILITIES:
            raise HTTPException(status_code=422, detail="可见性取值不合法")
        diary.visibility = body.visibility
        if body.allowed_user_ids is not None:
            for row in session.exec(
                select(DiaryAllowedUser).where(DiaryAllowedUser.diary_id == diary.id)
            ):
                session.delete(row)
            if body.visibility == "restricted":
                for uid in set(body.allowed_user_ids):
                    session.add(DiaryAllowedUser(diary_id=diary.id, user_id=uid))
    if body.locked is not None:
        diary.locked = body.locked
    redistill = False
    if body.use_for_twin is not None and body.use_for_twin != diary.use_for_twin:
        diary.use_for_twin = body.use_for_twin
        if body.use_for_twin:
            # 重新纳入:先清旧产物(理论上为空),再重跑蒸馏
            _purge_derived(session, diary.id)
            redistill = True
        else:
            # 移出:化身立刻不再依据它;日记本体保留
            _purge_derived(session, diary.id)
    session.add(diary)
    session.commit()
    session.refresh(diary)
    if redistill:
        background_tasks.add_task(run_pipeline_for_diary, diary.id)
    return _out(diary, _card_counts(session, me.id).get(diary.id, 0))


@router.get("/{diary_id}/allowed")
def get_allowed_users(
    diary_id: str,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    diary = _owned_diary(diary_id, me, session)
    ids = [
        row.user_id
        for row in session.exec(
            select(DiaryAllowedUser).where(DiaryAllowedUser.diary_id == diary.id)
        )
    ]
    users = [
        {"id": u.id, "username": u.username}
        for u in session.exec(select(User).where(User.id.in_(ids)))  # type: ignore[attr-defined]
    ] if ids else []
    return {"allowed_user_ids": ids, "allowed_users": users}


class DiaryEdit(BaseModel):
    content: str


@router.put("/{diary_id}")
def edit_diary(
    diary_id: str,
    body: DiaryEdit,
    background_tasks: BackgroundTasks,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> DiaryOut:
    """修改日记内容(仅限落笔 24 小时内);旧衍生数据作废并重新蒸馏。"""
    diary = _owned_diary(diary_id, me, session)
    if not _within_edit_window(diary):
        raise HTTPException(status_code=403, detail="超过 24 小时,日记已定格,不可再修改")
    content = body.content.strip()
    if not content:
        raise HTTPException(status_code=422, detail="日记内容不能为空")
    diary.content = content
    diary.updated_at = datetime.now(timezone.utc)
    # 内容变了,旧的对话对与卡片不再成立
    _purge_derived(session, diary.id)
    session.add(diary)
    session.commit()
    session.refresh(diary)
    if diary.use_for_twin:
        background_tasks.add_task(run_pipeline_for_diary, diary.id)
    return _out(diary)


@router.post("/{diary_id}/distill")
def redistill(
    diary_id: str,
    background_tasks: BackgroundTasks,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """手动重跑一篇日记的蒸馏(先清掉旧衍生数据,避免重复)。用户主动要求学习 = 打开训练闸门。"""
    diary = _owned_diary(diary_id, me, session)
    _purge_derived(session, diary.id)
    diary.use_for_twin = True
    session.add(diary)
    session.commit()
    background_tasks.add_task(run_pipeline_for_diary, diary.id)
    return {"status": "queued", "diary_id": diary.id}


@router.delete("/{diary_id}")
def delete_diary(
    diary_id: str,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    diary = _owned_diary(diary_id, me, session)
    # 隐私红线:级联删除所有衍生数据
    _purge_derived(session, diary.id)
    for allow in session.exec(
        select(DiaryAllowedUser).where(DiaryAllowedUser.diary_id == diary.id)
    ):
        session.delete(allow)
    session.delete(diary)
    session.commit()
    return {"deleted": diary.id}

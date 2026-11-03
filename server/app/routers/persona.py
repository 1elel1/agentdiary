"""人格卡片接口(可追溯性:每张卡片都能看到出处日记)。只能看、删自己的。"""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..auth import get_current_user
from ..db import get_session
from ..models import PersonaCard, User

router = APIRouter(prefix="/persona-cards", tags=["persona"])


@router.get("")
def list_cards(
    me: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> list[PersonaCard]:
    stmt = (
        select(PersonaCard)
        .where(PersonaCard.user_id == me.id)
        .order_by(PersonaCard.created_at.desc())  # type: ignore[attr-defined]
    )
    return list(session.exec(stmt))


@router.delete("/{card_id}")
def exclude_card(
    card_id: str,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    """把一条理解从化身里排除(硬删除;来源日记保留)。用户对自我模型的控制权。"""
    card = session.get(PersonaCard, card_id)
    if card is None or card.user_id != me.id:
        raise HTTPException(status_code=404, detail="卡片不存在")
    # 被它覆盖的旧卡片恢复为有效,避免留下一条「已被不存在的卡片覆盖」的孤儿
    for old in session.exec(select(PersonaCard).where(PersonaCard.superseded_by == card.id)):
        old.superseded_by = None
        session.add(old)
    session.delete(card)
    session.commit()
    return {"deleted": card_id}

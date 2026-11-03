"""AI 裁判:另一路 LLM 评估访客与化身的既有对话,达标解锁真人对话。

「双向确认后解锁真人」的最小实现(用户点名提前做的 Phase 2→3 机制):
- 只读 (化身主人, 访客) 的化身对话记录,不读日记(隐私红线)
- 硬门槛:访客至少投入 MIN_VISITOR_TURNS 句;分数 >= PASS_SCORE 才解锁
- 解锁按用户对生效(任一方向的通过报告即开双向 DM)
- 名人化身没有真人,不参与评估
"""

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, and_, func, or_, select

from .. import llm
from ..auth import get_current_user
from ..db import get_session
from ..models import ChatMessage, MatchReport, User
from ..ratelimit import check_rate_limit
from .chat import _recent_messages

router = APIRouter(prefix="/judge", tags=["judge"])

MIN_VISITOR_TURNS = 5
PASS_SCORE = 70
MAX_TRANSCRIPT = 60

_JUDGE_SYSTEM = """你是一个严格的社交契合度裁判。下面是一段「访客」与「化身」(某真实用户的数字分身)的聊天记录。
请评估两人聊得是否投机,是否值得解锁访客与真人的直接对话。评估维度:
1. 话题投机度:是否聊得起来,有共同话题,互相接得住话
2. 价值观呼应:观点是否有共鸣,或有质量的碰撞
3. 往来质量:访客是否真诚投入(敷衍的「哦」「嗯」要扣分)

输出 JSON:{"score": 0到100的整数, "summary": "总评,写给访客看,60字以内", "reasons": ["维度1评语,30字以内", "维度2评语,30字以内", "维度3评语,30字以内"]}
只输出 JSON,不要其他文字,严格遵守字数上限。评分要苛刻:泛泛寒暄给不到 60 分;70 分以上意味着你真心认为两人和真人也聊得来。"""


class ReportOut(BaseModel):
    id: str
    score: int
    summary: str
    reasons: list[str]
    passed: bool
    created_at: datetime


class JudgeStatus(BaseModel):
    visitor_turns: int
    min_turns: int
    can_evaluate: bool
    unlocked: bool
    report: ReportOut | None


def pair_unlocked(session: Session, a: str, b: str) -> bool:
    """任一方向存在通过的评估报告,即视为该两人已解锁真人对话。"""
    stmt = (
        select(MatchReport.id)
        .where(MatchReport.passed == True)  # noqa: E712
        .where(
            or_(
                and_(MatchReport.owner_id == a, MatchReport.visitor_id == b),
                and_(MatchReport.owner_id == b, MatchReport.visitor_id == a),
            )
        )
        .limit(1)
    )
    return session.exec(stmt).first() is not None


def _visitor_turns(session: Session, owner_id: str, visitor_id: str) -> int:
    return session.exec(
        select(func.count())
        .select_from(ChatMessage)
        .where(ChatMessage.agent_owner_id == owner_id)
        .where(ChatMessage.visitor_id == visitor_id)
        .where(ChatMessage.role == "user")
    ).one()


def _latest_report(session: Session, owner_id: str, visitor_id: str) -> MatchReport | None:
    stmt = (
        select(MatchReport)
        .where(MatchReport.owner_id == owner_id)
        .where(MatchReport.visitor_id == visitor_id)
        .order_by(MatchReport.created_at.desc())  # type: ignore[attr-defined]
        .limit(1)
    )
    return session.exec(stmt).first()


def _to_out(r: MatchReport) -> ReportOut:
    try:
        reasons = [str(x) for x in json.loads(r.reasons_json or "[]")]
    except json.JSONDecodeError:
        reasons = []
    return ReportOut(
        id=r.id,
        score=r.score,
        summary=r.summary,
        reasons=reasons,
        passed=r.passed,
        created_at=r.created_at,
    )


def _status_payload(session: Session, owner: User, me: User) -> JudgeStatus:
    turns = _visitor_turns(session, owner.id, me.id)
    report = _latest_report(session, owner.id, me.id)
    return JudgeStatus(
        visitor_turns=turns,
        min_turns=MIN_VISITOR_TURNS,
        can_evaluate=turns >= MIN_VISITOR_TURNS,
        unlocked=pair_unlocked(session, owner.id, me.id),
        report=_to_out(report) if report else None,
    )


def _resolve_target(target_user_id: str, me: User, session: Session) -> User:
    owner = session.get(User, target_user_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    if owner.id == me.id:
        raise HTTPException(status_code=400, detail="不能评估和自己化身的对话")
    if owner.is_builtin:
        raise HTTPException(status_code=400, detail="名人化身没有真人可解锁")
    if owner.is_seed:
        raise HTTPException(status_code=400, detail="TA 还没开放真人对话")
    return owner


@router.get("/{target_user_id}")
def judge_status(
    target_user_id: str,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> JudgeStatus:
    owner = _resolve_target(target_user_id, me, session)
    return _status_payload(session, owner, me)


@router.post("/{target_user_id}/evaluate")
def evaluate(
    target_user_id: str,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> JudgeStatus:
    # 每次评估都是一次完整 LLM 推理,限得比聊天更紧
    check_rate_limit(f"judge:{me.id}", max_calls=6, window_seconds=3600)
    owner = _resolve_target(target_user_id, me, session)

    turns = _visitor_turns(session, owner.id, me.id)
    if turns < MIN_VISITOR_TURNS:
        raise HTTPException(
            status_code=400,
            detail=f"至少和 TA 的化身聊 {MIN_VISITOR_TURNS} 句才能评估(当前 {turns} 句)",
        )

    transcript = "\n".join(
        f"{'访客' if m.role == 'user' else '化身'}:{m.content}"
        for m in _recent_messages(session, owner.id, me.id, MAX_TRANSCRIPT)
    )

    try:
        # 裁判是分析任务不是扮演任务,跟蒸馏共用强模型档:它要评的就是化身
        # 像不像,用化身自己那档模型评自己会失真
        data = llm.chat_json(_JUDGE_SYSTEM, transcript, profile=llm.DISTILL)
    except llm.LLMError as e:
        raise HTTPException(status_code=503, detail=f"裁判暂时下线:{e}") from e

    try:
        score = max(0, min(100, int(data.get("score", 0))))
    except (TypeError, ValueError):
        score = 0
    summary = str(data.get("summary", "")).strip() or "(裁判没有给出总评)"
    raw_reasons = data.get("reasons", [])
    reasons = [str(x).strip() for x in raw_reasons if str(x).strip()] if isinstance(raw_reasons, list) else []

    report = MatchReport(
        owner_id=owner.id,
        visitor_id=me.id,
        score=score,
        summary=summary,
        reasons_json=json.dumps(reasons, ensure_ascii=False),
        passed=score >= PASS_SCORE,
    )
    session.add(report)
    session.commit()

    return _status_payload(session, owner, me)

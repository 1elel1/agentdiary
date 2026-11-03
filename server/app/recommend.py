"""发现页:兴趣标签提炼 + 推荐打分。

为什么是标签而不是向量:Phase 0/1 的推荐只需要「让人想点进去看看」,标签重合
能直接给出可解释的理由(「你们都在意徒步、老电影」),成本是每篇日记一次小调用。
向量匹配留给 Phase 2 的匹配引擎(CLAUDE.md §3)。

标签来源:
- 真实用户:蒸馏出新卡片、或改了对外形象之后,后台用 DISTILL 档从
  「对外形象 + 最近的人格卡片」提炼 3~6 个短标签
- 种子用户:资料里直接给定
"""

import json
import logging
import random
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, func, select

from . import llm
from .models import DiaryEntry, PersonaCard, User

logger = logging.getLogger(__name__)

MAX_TAGS = 6
MAX_TAG_CHARS = 8
TAG_SOURCE_CARDS = 30

_TAGS_SYSTEM = (
    "你是兴趣标签提炼助手。根据一个人的自我介绍和若干条人格断言,提炼 3~6 个"
    "能概括 TA 的兴趣、生活方式或性格底色的短标签。要求:\n"
    "- 每个标签 2~6 个汉字,名词或短语,如「徒步」「老电影」「夜猫子」「慢热」「独居」「养猫」\n"
    "- 优先选别人也可能拥有、能用来找到同类的标签;不要写只属于这个人的具体事件\n"
    "- 不要出现人名、地名、公司名、疾病名\n"
    '只输出 JSON 对象:{"tags": ["...", "..."]}'
)


def parse_tags(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return [str(t) for t in data if str(t).strip()] if isinstance(data, list) else []


def normalize_tags(tags) -> list[str]:
    """去重、裁长、限量;保留顺序。"""
    out: list[str] = []
    for t in tags or []:
        t = str(t).strip().strip("#").replace(" ", "")
        if not t or len(t) > MAX_TAG_CHARS or t in out:
            continue
        out.append(t)
        if len(out) >= MAX_TAGS:
            break
    return out


def refresh_user_tags(session: Session, user: User) -> list[str]:
    """用 LLM 重新提炼一个用户的标签并落库。失败只记日志,不抛出。"""
    cards = list(
        session.exec(
            select(PersonaCard)
            .where(PersonaCard.user_id == user.id)
            .where(PersonaCard.superseded_by == None)  # noqa: E711
            .order_by(PersonaCard.created_at.desc())  # type: ignore[attr-defined]
            .limit(TAG_SOURCE_CARDS)
        )
    )
    persona = (user.public_persona or "").strip()
    if not cards and not persona:
        return []
    prompt = (
        f"自我介绍:{persona or '(无)'}\n\n人格断言:\n"
        + ("\n".join(f"- {c.assertion}" for c in cards) or "(无)")
    )
    try:
        data = llm.chat_json(_TAGS_SYSTEM, prompt, profile=llm.DISTILL)
        tags = normalize_tags(data.get("tags", []))
    except Exception:
        logger.exception("标签提炼失败 user=%s", user.id)
        return parse_tags(user.tags_json)
    user.tags_json = json.dumps(tags, ensure_ascii=False)
    user.tags_updated_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
    logger.info("标签更新 user=%s tags=%s", user.id, tags)
    return tags


def refresh_user_tags_by_id(user_id: str) -> None:
    """后台任务入口:自建 Session。"""
    from .db import engine

    with Session(engine) as session:
        user = session.get(User, user_id)
        if user is not None:
            refresh_user_tags(session, user)


def card_counts(session: Session) -> dict[str, int]:
    rows = session.exec(
        select(PersonaCard.user_id, func.count())
        .where(PersonaCard.superseded_by == None)  # noqa: E711
        .group_by(PersonaCard.user_id)
    ).all()
    return {uid: int(n) for uid, n in rows}


def last_diary_at(session: Session) -> dict[str, datetime]:
    rows = session.exec(
        select(DiaryEntry.user_id, func.max(DiaryEntry.created_at)).group_by(DiaryEntry.user_id)
    ).all()
    return {uid: ts for uid, ts in rows if ts is not None}


def _aware(ts: datetime | None) -> datetime | None:
    if ts is None:
        return None
    return ts.replace(tzinfo=timezone.utc) if ts.tzinfo is None else ts


# 推荐理由模板,按客户端界面语言选(X-Language);标签本身是日记里提炼的,不翻译
_REASONS: dict[str, dict[str, str]] = {
    "zh-Hans": {"overlap": "你们都在意 {tags}", "keywords": "TA 的关键词:{tags}", "persona": "TA 写了自我介绍", "active": "最近在写日记"},
    "zh-Hant": {"overlap": "你們都在意 {tags}", "keywords": "對方的關鍵詞:{tags}", "persona": "對方寫了自我介紹", "active": "最近在寫日記"},
    "en": {"overlap": "You both care about {tags}", "keywords": "Their keywords: {tags}", "persona": "Has written an intro", "active": "Writing lately"},
    "ja": {"overlap": "二人とも {tags} を大切にしている", "keywords": "キーワード:{tags}", "persona": "自己紹介を書いている", "active": "最近日記を書いている"},
    "ko": {"overlap": "둘 다 {tags}에 관심", "keywords": "키워드: {tags}", "persona": "자기소개를 썼어요", "active": "최근 일기를 쓰고 있어요"},
}


def _join_tags(tags: list[str], lang: str, quoted: bool) -> str:
    if lang == "en":
        return ", ".join(f"\u201c{t}\u201d" if quoted else t for t in tags)
    if lang == "ko":
        return ", ".join(f"'{t}'" if quoted else t for t in tags)
    return "、".join(f"「{t}」" if quoted else t for t in tags)


def reason_text(kind: str, tags: list[str], lang: str = "zh-Hans") -> str:
    tmpl = _REASONS.get(lang, _REASONS["zh-Hans"])[kind]
    return tmpl.format(tags=_join_tags(tags, lang, quoted=(kind == "overlap")))


def score_candidate(
    me_tags: set[str],
    user: User,
    user_tags: list[str],
    cards: int,
    last_diary: datetime | None,
    now: datetime,
    lang: str = "zh-Hans",
) -> tuple[float, str]:
    """返回 (分数, 推荐理由)。理由写给用户看,必须能从公开信息直接验证;文案随界面语言。"""
    overlap = [t for t in user_tags if t in me_tags]
    score = 3.0 * len(overlap)
    if user.public_persona:
        score += 1.0
    score += min(cards, 10) / 10.0
    recent = _aware(last_diary)
    if recent and now - recent < timedelta(days=7):
        score += 1.0
    if user.status_text and _aware(user.status_updated_at) and now - _aware(user.status_updated_at) < timedelta(hours=24):  # type: ignore[arg-type]
        score += 0.5

    if overlap:
        reason = reason_text("overlap", overlap[:3], lang)
    elif user_tags:
        reason = reason_text("keywords", user_tags[:3], lang)
    elif user.public_persona:
        reason = reason_text("persona", [], lang)
    else:
        reason = reason_text("active", [], lang)
    return score, reason


def recommend(
    session: Session,
    me: User,
    *,
    limit: int = 8,
    tag: str | None = None,
    seed: int = 0,
    exclude_ids: set[str] | None = None,
    lang: str = "zh-Hans",
) -> list[tuple[User, float, str, list[str], int]]:
    """给 me 推荐一批可访问的化身。

    候选:非本人、非名人、有卡片或有对外形象(否则化身没得聊)。
    按分数取前 3*limit,再用 seed 打乱后取 limit —— 「换一批」就是换 seed,
    保证每批都是高分里的随机子集,而不是永远同一张脸。
    """
    now = datetime.now(timezone.utc)
    me_tags = set(parse_tags(me.tags_json))
    counts = card_counts(session)
    last = last_diary_at(session)
    exclude = exclude_ids or set()

    scored = []
    for user in session.exec(select(User).where(User.id != me.id).where(User.is_builtin == False)):  # noqa: E712
        if user.id in exclude:
            continue
        tags = parse_tags(user.tags_json)
        cards = counts.get(user.id, 0)
        if cards == 0 and not user.public_persona:
            continue
        if tag and tag not in tags:
            continue
        score, reason = score_candidate(me_tags, user, tags, cards, last.get(user.id), now, lang)
        scored.append((user, score, reason, tags, cards))

    scored.sort(key=lambda x: (-x[1], x[0].username))
    pool = scored[: max(limit * 3, limit)]
    rng = random.Random(f"{me.id}:{tag or ''}:{seed}")
    rng.shuffle(pool)
    picked = pool[:limit]
    picked.sort(key=lambda x: -x[1])
    return picked


def popular_tags(session: Session, limit: int = 14) -> list[tuple[str, int]]:
    """全站出现最多的标签,给筛选条用。"""
    freq: dict[str, int] = {}
    for user in session.exec(select(User).where(User.is_builtin == False)):  # noqa: E712
        for t in parse_tags(user.tags_json):
            freq[t] = freq.get(t, 0) + 1
    return sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))[:limit]

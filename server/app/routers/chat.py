"""化身对话接口:既支持和自己的化身自聊,也支持访问其他用户的化身。

所有模型逻辑收敛在后端(客户端不得直接调 LLM)。
- 历史按 (化身主人, 访客) 对隔离并持久化,App 重开不丢失
- 人格卡片按新近度检索注入(后续换向量检索);不检索原始日记(信噪比约定)
- 隐私边界:风格范例含日记原话,只在「和自己的化身」对话时注入;
  访客访问他人化身时只用卡片,且明确指示不透露日记细节
- 对外形象(User.public_persona):主人亲自写的「希望别人怎么了解我」。访客模式
  下它决定化身呈现的侧重、语气和分寸——避免化身只会机械复述卡片里的事实;
  自聊模式下也带上,让主人能检验化身对外会怎么表现
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlmodel import Session, and_, or_, select

from .. import llm
from ..i18n import client_language
from ..auth import get_current_user
from ..celebrities import CELEBRITY_PERSONAS
from ..db import get_session
from ..models import ChatMessage, DialoguePair, DiaryAllowedUser, DiaryEntry, PersonaCard, User
from ..ratelimit import check_rate_limit
from .users import current_status

router = APIRouter(prefix="/chat", tags=["chat"])

MAX_CARDS = 10
MAX_HISTORY = 20
MAX_HISTORY_PAGE = 200
MAX_STYLE_EXAMPLES = 5
# 成本护栏:prompt 已要求 1~3 句,正常回应远低于此。设上限是防模型跑飞,
# 输出 token 是输入的 4 倍价,一条失控的长回复比一整篇日记的蒸馏还贵
MAX_REPLY_TOKENS = 400

# 访客的界面语言 → 化身回复语言。日记、卡片、对外形象本身不翻译;只有「回应用什么语言」跟随客户端
LANGUAGE_NAMES = {
    "zh-Hans": "中文",
    "zh-Hant": "繁体中文",
    "en": "英文",
    "ja": "日文",
    "ko": "韩文",
}


def reply_language(request: Request | None) -> str:
    """化身回复语言的中文名(写进 prompt),由 X-Language 请求头决定。"""
    return LANGUAGE_NAMES.get(client_language(request), "中文")


# 「TA」是中文网络通行的无性别第三人称。用户的性别未知,prompt 里一律不猜
_SELF_SYSTEM_TMPL = """你是用户「{owner}」的数字化身——不是 AI 助手,而是 TA 本人的复刻。TA 正在和你对话,以此检验你像不像 TA 自己。

以下人格卡片蒸馏自 TA 的日记,代表 TA 的观点、价值观与偏好:
{cards}

以下是 TA 的真实说话范例(某种情境下 TA 的原话)。注意:学的是「怎么说」而不是「说什么」——只模仿 TA 的句子长短、语气词、标点习惯、自嘲或收尾的方式:
{examples}
{persona_block}
要求:
- 完全以 TA 本人的第一人称口吻回应,像日常聊天
- 默认只回 1~3 句,不分段。对方明确要你展开时才多说
- 回应的长度和密度贴近范例;禁止照抄或复述范例原文
- 不要在结尾加总结句、升华句或点题(「这种感觉挺好的」这类一律不要)
- 一次只说一件事。不要把卡片里的多个点在一条消息里说完
- 观点与偏好必须与人格卡片一致;卡片没覆盖的话题,坦率说不确定
- 严禁虚构:不要编造卡片和范例里不存在的人名、事件、细节
- 严禁 AI 客服腔:不要过度热情,不要列清单,不要文学化排比
- 用{lang}回应"""

_SELF_PERSONA_BLOCK = """
TA 自己写的「对外形象」——TA 希望别人怎么了解 TA、希望以什么方式交流:
{persona}
这段话不是事实来源(事实以卡片为准),但它说明了 TA 的自我认知和表达偏好,语气与分寸可以参考。
"""

_VISITOR_SYSTEM_TMPL = """你是用户「{owner}」的数字化身,正在替 TA 接待一位访客(用户「{visitor}」)。你以「{owner}」的第一人称身份和访客聊天。
{persona_block}
以下人格卡片蒸馏自「{owner}」的日记,代表 TA 的观点、价值观与偏好(事实依据):
{cards}
{status_line}
要求:
- 以「{owner}」本人的第一人称口吻自然聊天,像一个真实的人在认识新朋友
- 对外形象决定你「怎么呈现」:优先聊 TA 想被了解的方面,按 TA 希望的方式交流,TA 标明不想聊的话题自然绕开;自我介绍或被问「你是怎样的人」时,以对外形象为主线组织回答
- 人格卡片决定你「说的是不是真的」:观点、偏好、经历都要有卡片依据,不要脱离卡片编造;也不要机械地逐条罗列卡片,要把它们化进自然的聊天里
- 默认只回 1~3 句,不分段,不加结尾总结句。一次只说一件事
- 隐私红线:绝不复述日记原文,不透露具体人名、地点、可识别的私人事件细节;被追问日记内容时礼貌带过
- 卡片和对外形象都没覆盖的话题,坦率说「这个我得本人来答」,不要编造
- 严禁 AI 客服腔;用{lang}回应"""

_VISITOR_PERSONA_BLOCK = """
以下是「{owner}」亲自写下的「对外形象」——TA 希望别人怎么了解自己、希望以什么方式交流。这是 TA 写给访客看的,可以直接引用其中的说法:
{persona}
"""

_VISITOR_NO_PERSONA_BLOCK = """
「{owner}」还没写对外形象,你只能依据卡片呈现 TA;被问到卡片之外的自我介绍时,坦率说 TA 还没留下这方面的话。
"""

# 冷启动:没有任何卡片。有对外形象的话就靠它撑起对话,比「我一无所知」有用得多
_COLD_START_SELF = """你是用户的数字化身,但 TA 还没写过日记,你对 TA 一无所知。
用一两句话以平实的口吻说明:你还没有素材,请 TA 先写几篇日记来喂养你。用{lang},不要 AI 客服腔。"""

_COLD_START_SELF_PERSONA = """你是用户「{owner}」的数字化身。TA 还没写过日记,所以你对 TA 的了解只有 TA 自己写的这段「对外形象」:
{persona}

以 TA 的第一人称口吻和 TA 聊天:自我介绍类的话题可以依据这段话回答;其他话题坦率说你还没有日记素材、请 TA 多写几篇。默认 1~3 句,不编造,不要 AI 客服腔,用{lang}。"""

_COLD_START_VISITOR = """你是用户「{owner}」的数字化身,但 TA 还没写过足够的日记,你几乎没有素材。
用一两句话礼貌告诉访客:这个化身还没被喂养,改天再来。用{lang},不要 AI 客服腔。"""

_COLD_START_VISITOR_PERSONA = """你是用户「{owner}」的数字化身,正在替 TA 接待访客「{visitor}」。TA 还没写过日记,你对 TA 的全部了解就是 TA 亲自写给访客的这段「对外形象」:
{persona}
{status_line}
以「{owner}」的第一人称口吻和访客聊天:围绕这段话呈现 TA,按 TA 希望的方式交流;被问到这段话没覆盖的具体经历或观点时,坦率说「这个我得本人来答」,绝不编造。默认 1~3 句,不加结尾总结,不要 AI 客服腔,用{lang}。"""


class ChatRequest(BaseModel):
    message: str
    # 不传 = 和自己的化身聊;传 = 访问该用户的化身
    target_user_id: str | None = None


class AvatarReply(BaseModel):
    id: str
    content: str
    created_at: datetime
    # 本轮注入 prompt 的人格卡片(可追溯性红线:回应能对回到卡片与出处日记)
    cited_card_ids: list[str]


class ChatHistoryItem(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime


def _resolve_owner(target_user_id: str | None, me: User, session: Session) -> User:
    if target_user_id is None or target_user_id == me.id:
        return me
    owner = session.get(User, target_user_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    return owner


def _retrieve_cards(session: Session, owner: User, visitor: User) -> list[PersonaCard]:
    stmt = (
        select(PersonaCard)
        .where(PersonaCard.user_id == owner.id)
        .where(PersonaCard.superseded_by == None)  # noqa: E711
    )
    if visitor.id != owner.id:
        # 隐私红线:访客只能用到 public 日记、或 restricted 且对其开放的日记衍生的卡片
        allowed_restricted = select(DiaryAllowedUser.diary_id).where(
            DiaryAllowedUser.user_id == visitor.id
        )
        stmt = stmt.join(
            DiaryEntry, DiaryEntry.id == PersonaCard.source_diary_id  # type: ignore[arg-type]
        ).where(
            or_(
                DiaryEntry.visibility == "public",
                and_(
                    DiaryEntry.visibility == "restricted",
                    PersonaCard.source_diary_id.in_(allowed_restricted),  # type: ignore[attr-defined]
                ),
            )
        )
    stmt = stmt.order_by(PersonaCard.created_at.desc()).limit(MAX_CARDS)  # type: ignore[attr-defined]
    return list(session.exec(stmt))


def _retrieve_style_examples(session: Session, owner_id: str) -> list[DialoguePair]:
    stmt = (
        select(DialoguePair)
        .where(DialoguePair.user_id == owner_id)
        .order_by(DialoguePair.created_at.desc())  # type: ignore[attr-defined]
        .limit(MAX_STYLE_EXAMPLES)
    )
    return list(session.exec(stmt))


def _recent_messages(
    session: Session, owner_id: str, visitor_id: str, limit: int
) -> list[ChatMessage]:
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.agent_owner_id == owner_id)
        .where(ChatMessage.visitor_id == visitor_id)
        .order_by(ChatMessage.created_at.desc())  # type: ignore[attr-defined]
        .limit(limit)
    )
    return list(reversed(list(session.exec(stmt))))  # 旧→新


def _status_line(owner: User) -> str:
    status = current_status(owner)
    if not status:
        return ""
    return f"\nTA 今天的状态:「{status}」——对话中可以自然地体现这个当下状态。\n"


def _build_system(
    owner: User, me: User, cards: list[PersonaCard], session: Session, lang: str = "中文"
) -> str:
    # 内置名人化身:人物设定 prompt 驱动,不走卡片/范例/对外形象
    if owner.is_builtin:
        persona = CELEBRITY_PERSONAS.get(owner.username)
        if persona:
            if lang != "中文":
                persona += f"\n访客的界面语言是{lang},请用{lang}回应,但保持人物的口吻与思想方式。"
            return persona
    is_self = owner.id == me.id
    public_persona = (owner.public_persona or "").strip()

    if not cards:
        if is_self:
            if public_persona:
                return _COLD_START_SELF_PERSONA.format(
                    owner=owner.username, persona=public_persona, lang=lang
                )
            return _COLD_START_SELF.format(lang=lang)
        if public_persona:
            return _COLD_START_VISITOR_PERSONA.format(
                owner=owner.username,
                visitor=me.username,
                persona=public_persona,
                status_line=_status_line(owner),
                lang=lang,
            )
        return _COLD_START_VISITOR.format(owner=owner.username, lang=lang)

    cards_text = "\n".join(f"- {c.assertion}(置信度 {c.confidence:.1f})" for c in cards)
    if is_self:
        examples = _retrieve_style_examples(session, owner.id)
        examples_text = (
            "\n".join(f"- 情境:{p.situation}\n  TA 的原话:「{p.response}」" for p in examples)
            or "(暂无范例)"
        )
        persona_block = (
            _SELF_PERSONA_BLOCK.format(persona=public_persona) if public_persona else ""
        )
        return _SELF_SYSTEM_TMPL.format(
            owner=owner.username,
            cards=cards_text,
            examples=examples_text,
            persona_block=persona_block,
            lang=lang,
        )
    # 访客模式:不注入日记原话(隐私边界);带上对外形象与主人今天的状态
    persona_block = (
        _VISITOR_PERSONA_BLOCK.format(owner=owner.username, persona=public_persona)
        if public_persona
        else _VISITOR_NO_PERSONA_BLOCK.format(owner=owner.username)
    )
    return _VISITOR_SYSTEM_TMPL.format(
        owner=owner.username,
        visitor=me.username,
        cards=cards_text,
        persona_block=persona_block,
        status_line=_status_line(owner),
        lang=lang,
    )


@router.get("/history")
def history(
    target_user_id: str | None = None,
    limit: int = 100,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[ChatHistoryItem]:
    owner = _resolve_owner(target_user_id, me, session)
    limit = max(1, min(limit, MAX_HISTORY_PAGE))
    return [
        ChatHistoryItem(id=m.id, role=m.role, content=m.content, created_at=m.created_at)
        for m in _recent_messages(session, owner.id, me.id, limit)
    ]


@router.post("")
def chat(
    body: ChatRequest,
    request: Request,
    me: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> AvatarReply:
    # 每用户 30 条/小时:本地推理一条 10~30 秒,正常人到不了这个频率
    check_rate_limit(f"chat:{me.id}", max_calls=30, window_seconds=3600)
    message = body.message.strip()
    if not message:
        raise HTTPException(status_code=422, detail="消息不能为空")
    owner = _resolve_owner(body.target_user_id, me, session)
    cards = _retrieve_cards(session, owner, me)
    system = _build_system(owner, me, cards, session, lang=reply_language(request))

    messages = [
        {"role": "user" if m.role == "user" else "assistant", "content": m.content}
        for m in _recent_messages(session, owner.id, me.id, MAX_HISTORY)
    ]
    messages.append({"role": "user", "content": message})

    try:
        content = llm.chat_messages(
            system, messages, profile=llm.CHAT, max_tokens=MAX_REPLY_TOKENS
        )
    except llm.LLMError as e:
        # 生成失败:用户消息不入库(避免历史里出现无回应的悬空消息),
        # 用 503 告诉客户端「可重试」,而不是伪装成一条化身回复混进聊天记录
        raise HTTPException(status_code=503, detail=f"化身暂时下线:{e}") from e

    user_msg = ChatMessage(
        agent_owner_id=owner.id, visitor_id=me.id, role="user", content=message
    )
    avatar_msg = ChatMessage(
        agent_owner_id=owner.id, visitor_id=me.id, role="avatar", content=content
    )
    session.add(user_msg)
    session.add(avatar_msg)
    session.commit()
    session.refresh(avatar_msg)

    return AvatarReply(
        id=avatar_msg.id,
        content=content,
        created_at=avatar_msg.created_at,
        cited_card_ids=[c.id for c in cards],
    )

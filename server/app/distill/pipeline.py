"""蒸馏 pipeline v1。

流程(CLAUDE.md §2):
    日记 → 脱敏 → 切片 → ①逆向构造「情境→用户口吻回应」对话对(表层风格,LoRA 素材)
                        → ②抽取人格断言卡片(深层人格,RAG 素材)

当前用本地 Ollama(qwen)实现;在 FastAPI BackgroundTasks 中异步执行,
不阻塞日记保存。后续训练任务上 GPU 时升级为正式任务队列。
"""

import logging

from sqlmodel import Session

from .. import llm
from ..config import DATA_DIR
from ..db import engine
from ..models import DialoguePair, DiaryEntry, PersonaCard, User
from ..recommend import refresh_user_tags
from .privacy import sanitize

logger = logging.getLogger(__name__)
# 蒸馏日志单独落盘:后台任务的失败在控制台里看不见,必须可追查。
# 落在数据目录而不是代码目录:和 DB、头像一样随 AGENTDIARY_DATA_DIR 外置,
# 重新部署 / git 操作不会碰到它
if not logger.handlers:
    _handler = logging.FileHandler(DATA_DIR / "distill.log", encoding="utf-8")
    _handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)

# 单篇日记最多处理的切片数,控制本地推理耗时
MAX_SLICES = 5

_SITUATION_SYSTEM = (
    "你是训练数据构造助手。给定用户日记中的一段话,推测在什么对话情境下"
    "(朋友问了什么、或发生了什么事)用户会自然地说出这段话。"
    "关键:构造的是「对话」情境,这样这段话才能作为对话回应来训练,而不是日记独白。"
    "只输出一句话的情境描述,不要任何解释或多余内容。"
)

_CARDS_SYSTEM = (
    "你是人格分析助手。从用户日记中抽取「人格断言卡片」:关于这个人的观点、"
    "价值排序、偏好、幽默方式、行为模式、当下心态的陈述句。要求:\n"
    "- 每条断言独立、具体,用第三人称(如「他认为…」「他习惯…」)\n"
    "- 简短或情绪化的内容同样有信息量:担忧、自嘲、兴奋、自我怀疑都可以形成断言"
    "(如「他正为考试失败而自我怀疑」),不要因为内容短就拒绝\n"
    "- confidence 为 0~1,表示日记证据对该断言的支撑强度\n"
    "- 不编造日记中没有依据的断言;确实完全无法提炼时输出空数组\n"
    '无论如何只输出 JSON 对象:{"cards": [{"assertion": "...", "confidence": 0.8}]}'
)


def slice_diary(content: str) -> list[str]:
    """按段落切片。后续可换语义切片。"""
    return [p.strip() for p in content.split("\n") if p.strip()]


def build_dialogue_pairs(diary: DiaryEntry, slices: list[str]) -> list[DialoguePair]:
    """逆向构造对话对:避免直接拿日记原文训练导致化身学成日记腔。"""
    pairs = []
    for s in slices[:MAX_SLICES]:
        situation = llm.chat(_SITUATION_SYSTEM, s, profile=llm.DISTILL)
        pairs.append(
            DialoguePair(
                user_id=diary.user_id, source_diary_id=diary.id, situation=situation, response=s
            )
        )
    return pairs


def extract_persona_cards(diary: DiaryEntry, clean_content: str) -> list[PersonaCard]:
    """抽取人格断言卡片,带置信度与出处。"""
    data = llm.chat_json(_CARDS_SYSTEM, clean_content, profile=llm.DISTILL)
    if not data.get("cards"):
        # 空结果必须留痕:模型可能拒绝抽取(返回 error_message 等),否则无从排查
        logger.warning("卡片抽取为空 diary=%s 模型返回=%s", diary.id, str(data)[:300])
    cards = []
    for item in data.get("cards", []):
        assertion = str(item.get("assertion", "")).strip()
        if not assertion:
            continue
        try:
            confidence = min(1.0, max(0.0, float(item.get("confidence", 0.5))))
        except (TypeError, ValueError):
            confidence = 0.5
        cards.append(
            PersonaCard(
                user_id=diary.user_id,
                source_diary_id=diary.id,
                assertion=assertion,
                confidence=confidence,
            )
        )
    return cards


MAX_ATTEMPTS = 2


def _attempt(what: str, fn):
    """跑一个蒸馏步骤,失败重试;彻底失败返回 None,只记日志不抛出。

    捕获所有异常而非仅 LLMError:模型返回的 JSON 结构不合预期等问题
    曾让整个后台任务无声死亡、所有产物丢失。
    """
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return fn()
        except Exception:
            logger.exception("%s 失败(第 %d/%d 次)", what, attempt, MAX_ATTEMPTS)
    return None


def run_pipeline_for_diary(diary_id: str) -> None:
    """后台任务入口:自建 Session,对单篇日记跑完整蒸馏流程并落库。

    两个步骤各自独立提交:一步失败不连累另一步;
    失败只记 distill.log 不抛出——日记本体已保存,可通过重蒸馏接口补跑。
    """
    with Session(engine) as session:
        diary = session.get(DiaryEntry, diary_id)
        if diary is None:
            return
        clean = sanitize(diary.content)  # 红线:先脱敏再进入任何蒸馏步骤
        slices = slice_diary(clean)
        logger.info("开始蒸馏 diary=%s slices=%d", diary_id, len(slices))

        pairs = _attempt(f"对话对构造 diary={diary_id}", lambda: build_dialogue_pairs(diary, slices))
        if pairs:
            for pair in pairs:
                session.add(pair)
            session.commit()
            logger.info("对话对入库 %d 条 diary=%s", len(pairs), diary_id)

        cards = _attempt(f"卡片抽取 diary={diary_id}", lambda: extract_persona_cards(diary, clean))
        if cards:
            for card in cards:
                session.add(card)
            session.commit()
            logger.info("卡片入库 %d 张 diary=%s", len(cards), diary_id)
            # 卡片变了,发现页用的兴趣标签跟着重提炼(失败只记日志)
            user = session.get(User, diary.user_id)
            if user is not None:
                _attempt(f"标签提炼 user={user.id}", lambda: refresh_user_tags(session, user))

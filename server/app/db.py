"""SQLite 存储。生产化前需换加密存储方案(隐私红线:存储加密)。"""

import logging
import os
import secrets

from sqlmodel import Session, SQLModel, create_engine, text

from .config import DB_PATH

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})

logger = logging.getLogger(__name__)

# 旧单人版数据在多用户迁移时归入此账号
LEGACY_USERNAME = "1iyi"
# 曾经硬编码成 "agentdiary" 明文提交进仓库,公网暴露后等于一个已知口令的后门。
# 现在:优先读环境变量,没设就随机生成并只打印一次(不落盘、不进 git)
LEGACY_PASSWORD = os.environ.get("LEGACY_PASSWORD") or secrets.token_urlsafe(12)
_LEAKED_LEGACY_PASSWORD = "agentdiary"  # 仅用于启动时检测老库是否还在用它


def _column_exists(conn, table: str, column: str) -> bool:
    rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return any(r[1] == column for r in rows)


def _migrate(conn) -> None:
    """SQLite 简易迁移:create_all 不会给已存在的表加列,这里手动补。"""
    added = []
    for table in ("diaryentry", "dialoguepair", "personacard"):
        if conn.execute(text(f"SELECT name FROM sqlite_master WHERE name='{table}'")).fetchone():
            if not _column_exists(conn, table, "user_id"):
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN user_id TEXT"))
                added.append(f"{table}.user_id")
    if conn.execute(text("SELECT name FROM sqlite_master WHERE name='chatmessage'")).fetchone():
        for col in ("agent_owner_id", "visitor_id"):
            if not _column_exists(conn, "chatmessage", col):
                conn.execute(text(f"ALTER TABLE chatmessage ADD COLUMN {col} TEXT"))
                added.append(f"chatmessage.{col}")
    if conn.execute(text("SELECT name FROM sqlite_master WHERE name='user'")).fetchone():
        if not _column_exists(conn, "user", "is_builtin"):
            conn.execute(text("ALTER TABLE user ADD COLUMN is_builtin BOOLEAN DEFAULT 0"))
            added.append("user.is_builtin")
        for col, ddl in (
            ("status_text", "ALTER TABLE user ADD COLUMN status_text TEXT"),
            ("status_updated_at", "ALTER TABLE user ADD COLUMN status_updated_at TIMESTAMP"),
            ("avatar_updated_at", "ALTER TABLE user ADD COLUMN avatar_updated_at TIMESTAMP"),
            ("public_persona", "ALTER TABLE user ADD COLUMN public_persona TEXT"),
            ("persona_updated_at", "ALTER TABLE user ADD COLUMN persona_updated_at TIMESTAMP"),
            ("tags_json", "ALTER TABLE user ADD COLUMN tags_json TEXT"),
            ("tags_updated_at", "ALTER TABLE user ADD COLUMN tags_updated_at TIMESTAMP"),
            ("is_seed", "ALTER TABLE user ADD COLUMN is_seed BOOLEAN DEFAULT 0"),
        ):
            if not _column_exists(conn, "user", col):
                conn.execute(text(ddl))
                added.append(f"user.{col}")
    if conn.execute(text("SELECT name FROM sqlite_master WHERE name='diaryentry'")).fetchone():
        if not _column_exists(conn, "diaryentry", "visibility"):
            conn.execute(
                text("ALTER TABLE diaryentry ADD COLUMN visibility TEXT DEFAULT 'public'")
            )
            added.append("diaryentry.visibility")
        if not _column_exists(conn, "diaryentry", "locked"):
            conn.execute(text("ALTER TABLE diaryentry ADD COLUMN locked BOOLEAN DEFAULT 0"))
            added.append("diaryentry.locked")
        if not _column_exists(conn, "diaryentry", "use_for_twin"):
            conn.execute(text("ALTER TABLE diaryentry ADD COLUMN use_for_twin BOOLEAN DEFAULT 1"))
            added.append("diaryentry.use_for_twin")
    if conn.execute(text("SELECT name FROM sqlite_master WHERE name='personacard'")).fetchone():
        if not _column_exists(conn, "personacard", "kind"):
            conn.execute(text("ALTER TABLE personacard ADD COLUMN kind TEXT"))
            added.append("personacard.kind")
    if added:
        logger.warning("迁移新增列: %s", added)


def _adopt_orphans() -> None:
    """把无归属的旧数据划给 legacy 账号(单人版历史数据)。"""
    from .auth import hash_password
    from .models import User

    with Session(engine) as session:
        orphan = session.execute(
            text("SELECT COUNT(*) FROM diaryentry WHERE user_id IS NULL")
        ).scalar_one()
        if not orphan:
            return
        from sqlmodel import select

        legacy = session.exec(select(User).where(User.username == LEGACY_USERNAME)).first()
        if legacy is None:
            legacy = User(username=LEGACY_USERNAME, password_hash=hash_password(LEGACY_PASSWORD))
            session.add(legacy)
            session.commit()
            session.refresh(legacy)
            if not os.environ.get("LEGACY_PASSWORD"):
                # 随机口令只在这一次出现,记下来否则进不去这个账号
                logger.warning(
                    "已创建账号 %s,随机初始密码:%s(仅此一次显示,请立刻登录改掉)",
                    LEGACY_USERNAME,
                    LEGACY_PASSWORD,
                )
        for table in ("diaryentry", "dialoguepair", "personacard"):
            session.execute(
                text(f"UPDATE {table} SET user_id = :uid WHERE user_id IS NULL"),
                {"uid": legacy.id},
            )
        session.execute(
            text(
                "UPDATE chatmessage SET agent_owner_id = :uid, visitor_id = :uid "
                "WHERE agent_owner_id IS NULL"
            ),
            {"uid": legacy.id},
        )
        session.commit()
        logger.warning("已把 %d 篇旧日记及衍生数据归入账号 %s", orphan, LEGACY_USERNAME)


def _seed_celebrities() -> None:
    """创建内置名人化身账号(随机密码,不可登录)。"""
    import secrets

    from sqlmodel import select

    from .auth import hash_password
    from .celebrities import CELEBRITY_PERSONAS
    from .models import User

    with Session(engine) as session:
        for name in CELEBRITY_PERSONAS:
            if session.exec(select(User).where(User.username == name)).first() is None:
                session.add(
                    User(
                        username=name,
                        password_hash=hash_password(secrets.token_hex(16)),
                        is_builtin=True,
                    )
                )
                logger.warning("已创建内置名人化身: %s", name)
        session.commit()


def _warn_weak_legacy_password() -> None:
    """老库里 legacy 账号可能还在用曾经硬编码的明文口令。

    不代改:静默改密会把用户锁在自己账号外面。只报警,让人自己用改密接口换掉。
    """
    from sqlmodel import select

    from .auth import verify_password
    from .models import User

    with Session(engine) as session:
        legacy = session.exec(select(User).where(User.username == LEGACY_USERNAME)).first()
        if legacy and verify_password(_LEAKED_LEGACY_PASSWORD, legacy.password_hash):
            logger.warning(
                "安全告警:账号 %s 仍在使用曾提交进仓库的默认口令。"
                "公网部署前必须通过改密接口换掉,否则等于一个已知口令的后门。",
                LEGACY_USERNAME,
            )


def init_db() -> None:
    logger.warning("数据目录:%s(部署时须指到代码目录之外)", DB_PATH.parent)
    with engine.begin() as conn:
        _migrate(conn)
    SQLModel.metadata.create_all(engine)
    _adopt_orphans()
    _seed_celebrities()
    _warn_weak_legacy_password()


def get_session():
    with Session(engine) as session:
        yield session

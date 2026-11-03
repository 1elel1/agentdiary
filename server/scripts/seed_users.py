"""种子用户:把 server/seed/users-*.json 里撰写好的资料导入数据库。

    .venv/bin/python scripts/seed_users.py            # 导入(已存在的用户名跳过,可重复执行)
    .venv/bin/python scripts/seed_users.py --purge    # 删除全部种子用户及其衍生数据
    .venv/bin/python scripts/seed_users.py --count    # 只看数量

口令:所有种子用户共用一个,来源依次是环境变量 SEED_USER_PASSWORD、
数据目录下的 seed-password.txt;都没有就随机生成一个写进该文件(600),
**绝不打印到标准输出**(部署日志是公开的)。

数据目录由 AGENTDIARY_DATA_DIR 指定(与 API 同一份库)。导入时直接写卡片与对话对,
不跑 LLM 蒸馏——资料是人写的,比抽出来的更准,也不花 token。
"""

import argparse
import glob
import json
import os
import random
import secrets
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlmodel import Session, select  # noqa: E402

from app.auth import hash_password  # noqa: E402
from app.config import DATA_DIR  # noqa: E402
from app.db import engine, init_db  # noqa: E402
from app.models import (  # noqa: E402
    ChatMessage,
    DialoguePair,
    DiaryAllowedUser,
    DiaryEntry,
    DirectMessage,
    MatchReport,
    PersonaCard,
    User,
)

SEED_DIR = ROOT / "seed"


def load_seed_users() -> list[dict]:
    users: list[dict] = []
    for path in sorted(glob.glob(str(SEED_DIR / "users-*.json"))):
        with open(path, encoding="utf-8") as f:
            users.extend(json.load(f))
    names = [u["username"] for u in users]
    dupes = {n for n in names if names.count(n) > 1}
    if dupes:
        raise SystemExit(f"种子文件里有重复用户名: {sorted(dupes)}")
    return users


def seed_password() -> str:
    env = os.environ.get("SEED_USER_PASSWORD", "").strip()
    if env:
        return env
    path = DATA_DIR / "seed-password.txt"
    if path.exists():
        return path.read_text(encoding="utf-8").strip()
    pw = secrets.token_urlsafe(9)
    path.write_text(pw + "\n", encoding="utf-8")
    os.chmod(path, 0o600)
    print(f"已生成种子用户口令并写入 {path}(未打印)。读取: cat {path}")
    return pw


def import_users(users: list[dict]) -> None:
    password_hash = hash_password(seed_password())
    now = datetime.now(timezone.utc)
    rng = random.Random(20261103)
    created = skipped = 0
    with Session(engine) as session:
        for u in users:
            if session.exec(select(User).where(User.username == u["username"])).first():
                skipped += 1
                continue
            created_at = now - timedelta(days=u.get("created_days_ago", 30), hours=rng.randint(0, 20))
            status = u.get("status")
            user = User(
                username=u["username"],
                password_hash=password_hash,
                is_seed=True,
                public_persona=u.get("persona"),
                persona_updated_at=created_at + timedelta(days=1) if u.get("persona") else None,
                status_text=status,
                # 状态 24h 过期:给个最近几小时内的时间,导入后当天有效
                status_updated_at=now - timedelta(minutes=rng.randint(10, 600)) if status else None,
                tags_json=json.dumps(u.get("tags", []), ensure_ascii=False),
                tags_updated_at=now,
                created_at=created_at,
            )
            session.add(user)
            session.commit()
            session.refresh(user)

            diaries: list[DiaryEntry] = []
            for d in u.get("diaries", []):
                ts = now - timedelta(days=d.get("days_ago", 1), hours=rng.randint(0, 14), minutes=rng.randint(0, 59))
                diary = DiaryEntry(
                    user_id=user.id,
                    content=d["content"].strip(),
                    visibility=d.get("visibility", "public"),
                    created_at=ts,
                    updated_at=ts,
                )
                session.add(diary)
                diaries.append(diary)
            session.commit()
            for diary in diaries:
                session.refresh(diary)

            for c in u.get("cards", []):
                src = diaries[c["diary"]]
                session.add(
                    PersonaCard(
                        user_id=user.id,
                        source_diary_id=src.id,
                        assertion=c["assertion"].strip(),
                        confidence=float(c.get("confidence", 0.7)),
                        created_at=src.created_at + timedelta(minutes=2),
                    )
                )
            for pr in u.get("pairs", []):
                src = diaries[pr["diary"]]
                session.add(
                    DialoguePair(
                        user_id=user.id,
                        source_diary_id=src.id,
                        situation=pr["situation"].strip(),
                        response=pr["response"].strip(),
                        created_at=src.created_at + timedelta(minutes=1),
                    )
                )
            session.commit()
            created += 1
    print(f"种子用户导入完成:新建 {created},已存在跳过 {skipped},共 {len(users)} 份资料")


def purge() -> None:
    with Session(engine) as session:
        seeds = list(session.exec(select(User).where(User.is_seed == True)))  # noqa: E712
        ids = [u.id for u in seeds]
        if not ids:
            print("没有种子用户")
            return
        diary_ids = [d.id for d in session.exec(select(DiaryEntry).where(DiaryEntry.user_id.in_(ids)))]  # type: ignore[attr-defined]
        if diary_ids:
            for row in session.exec(select(DiaryAllowedUser).where(DiaryAllowedUser.diary_id.in_(diary_ids))):  # type: ignore[attr-defined]
                session.delete(row)
        for model, cols in (
            (PersonaCard, (PersonaCard.user_id,)),
            (DialoguePair, (DialoguePair.user_id,)),
            (DiaryEntry, (DiaryEntry.user_id,)),
            (ChatMessage, (ChatMessage.agent_owner_id, ChatMessage.visitor_id)),
            (MatchReport, (MatchReport.owner_id, MatchReport.visitor_id)),
            (DirectMessage, (DirectMessage.sender_id, DirectMessage.recipient_id)),
        ):
            for col in cols:
                for row in session.exec(select(model).where(col.in_(ids))):  # type: ignore[attr-defined]
                    session.delete(row)
        for u in seeds:
            session.delete(u)
        session.commit()
    print(f"已删除 {len(ids)} 个种子用户及其衍生数据")


def count() -> None:
    with Session(engine) as session:
        total = len(list(session.exec(select(User))))
        seeds = len(list(session.exec(select(User).where(User.is_seed == True))))  # noqa: E712
        builtin = len(list(session.exec(select(User).where(User.is_builtin == True))))  # noqa: E712
    print(f"用户总数 {total}:种子 {seeds},名人化身 {builtin},真实用户 {total - seeds - builtin}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--purge", action="store_true")
    ap.add_argument("--count", action="store_true")
    args = ap.parse_args()
    init_db()
    if args.count:
        count()
    elif args.purge:
        purge()
    else:
        import_users(load_seed_users())
        count()


if __name__ == "__main__":
    main()

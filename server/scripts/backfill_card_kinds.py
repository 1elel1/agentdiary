"""v4.3 迁移后的一次性回填:种子用户的卡片是人工撰写的稳定事实,统一标 kind=stable。

真实用户 v4.3 之前抽取的旧卡片保持 kind=NULL(界面上归入「早期理解」,化身照常使用),
不花 token 重跑;用户想要分类可以对单篇日记「让化身重新学习」。只打印数量。

    cd server && .venv/bin/python scripts/backfill_card_kinds.py
"""

from sqlmodel import Session, select

from app.db import engine, init_db
from app.models import PersonaCard, User


def main() -> None:
    init_db()
    with Session(engine) as session:
        seed_ids = {u.id for u in session.exec(select(User).where(User.is_seed == True))}  # noqa: E712
        n = 0
        for card in session.exec(select(PersonaCard).where(PersonaCard.kind == None)):  # noqa: E711
            if card.user_id in seed_ids:
                card.kind = "stable"
                session.add(card)
                n += 1
        session.commit()
        print(f"回填 kind=stable 的种子卡片:{n}")


if __name__ == "__main__":
    main()

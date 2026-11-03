"""重置某个账号的密码(服务器上手动执行,口令不能找回,只能重置)。

    .venv/bin/python scripts/reset_password.py <用户名>
    # 然后按提示输入新密码(不回显);会吊销该账号全部已登录设备
"""

import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlmodel import Session, select  # noqa: E402

from app.auth import hash_password  # noqa: E402
from app.db import engine, init_db  # noqa: E402
from app.models import AuthToken, User  # noqa: E402


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    username = sys.argv[1]
    init_db()
    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == username)).first()
        if user is None:
            raise SystemExit(f"没有这个用户:{username}")
        pw = getpass.getpass("新密码(至少 6 位):")
        if len(pw) < 6 or pw != getpass.getpass("再输一次:"):
            raise SystemExit("两次不一致或太短,未修改")
        user.password_hash = hash_password(pw)
        session.add(user)
        for t in session.exec(select(AuthToken).where(AuthToken.user_id == user.id)):
            session.delete(t)
        session.commit()
    print(f"已重置 {username} 的密码,并退出了其所有设备")


if __name__ == "__main__":
    main()

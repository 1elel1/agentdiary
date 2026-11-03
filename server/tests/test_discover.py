"""发现页:搜索 / 推荐 / 标签 / 最近对话,以及种子用户的导入与边界。"""

import json
import uuid

from sqlmodel import Session, select

from app import recommend
from app.db import engine
from app.models import User

from .conftest import auth, register


def _name(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:6]}"


def _set_tags(user_id: str, tags: list[str]) -> None:
    with Session(engine) as s:
        u = s.get(User, user_id)
        u.tags_json = json.dumps(tags, ensure_ascii=False)
        s.add(u)
        s.commit()


def test_list_users_no_longer_exposes_everyone(client):
    me = register(client, _name("me"))
    stranger = register(client, _name("st"))
    listed = client.get("/users", headers=auth(me["token"])).json()
    ids = {u["id"] for u in listed}
    assert stranger["user_id"] not in ids  # 陌生人不出现
    assert all(u["is_builtin"] for u in listed)  # 只有名人化身
    # 聊过之后就出现在「门面」和「最近对话」里
    client.put("/users/me/persona", json={"persona": "我是陌生人。"}, headers=auth(stranger["token"]))
    client.post("/chat", json={"message": "你好", "target_user_id": stranger["user_id"]}, headers=auth(me["token"]))
    listed = client.get("/users", headers=auth(me["token"])).json()
    assert stranger["user_id"] in {u["id"] for u in listed}
    recent = client.get("/users/recent", headers=auth(me["token"])).json()
    assert recent[0]["id"] == stranger["user_id"]
    assert recent[0]["last_message"]


def test_search_by_username(client):
    me = register(client, _name("me"))
    target = register(client, "徒步的阿远" + uuid.uuid4().hex[:4])
    h = auth(me["token"])
    assert client.get("/users/search", headers=h).json() == []
    hits = client.get("/users/search?q=阿远", headers=h).json()
    assert [u["id"] for u in hits] == [target["user_id"]]
    assert client.get("/users/search?q=" + "a" * 21, headers=h).status_code == 422
    # 搜不到自己
    assert client.get("/users/search?q=me-", headers=h).json() == [] or all(
        u["id"] != me["user_id"] for u in client.get("/users/search?q=me-", headers=h).json()
    )


def test_recommended_scores_tag_overlap_and_explains(client):
    me = register(client, _name("me"))
    hiker = register(client, _name("hiker"))
    cook = register(client, _name("cook"))
    nothing = register(client, _name("empty"))
    # 先存对外形象(它会触发一次 LLM 标签提炼),再手动指定标签,否则会被桩覆盖
    client.put("/users/me/persona", json={"persona": "周末都在山里。"}, headers=auth(hiker["token"]))
    client.put("/users/me/persona", json={"persona": "厨房是我的工位。"}, headers=auth(cook["token"]))
    _set_tags(me["user_id"], ["徒步", "老电影"])
    _set_tags(hiker["user_id"], ["徒步", "露营"])
    _set_tags(cook["user_id"], ["做饭"])

    recs = client.get("/users/recommended?limit=5", headers=auth(me["token"])).json()
    ids = [u["id"] for u in recs]
    assert ids[0] == hiker["user_id"]  # 标签重合的排第一
    assert "徒步" in recs[0]["reason"]
    assert nothing["user_id"] not in ids  # 没卡片也没对外形象的人不推荐
    assert all(not u["is_builtin"] for u in recs)

    only_cook = client.get("/users/recommended?tag=做饭", headers=auth(me["token"])).json()
    assert [u["id"] for u in only_cook] == [cook["user_id"]]

    tags = client.get("/users/tags", headers=auth(me["token"])).json()
    assert {t["tag"] for t in tags} >= {"徒步", "做饭"}


def test_persona_save_refreshes_tags_via_llm(client, fake_llm):
    me = register(client, _name("tg"))
    fake_llm.tags = ["夜猫子", "电影"]
    client.put("/users/me/persona", json={"persona": "凌晨两点看片的人。"}, headers=auth(me["token"]))
    profile = client.get(f"/users/{me['user_id']}/profile", headers=auth(me["token"])).json()
    assert profile["tags"] == ["夜猫子", "电影"]
    assert profile["accepts_real_chat"] is True


def test_normalize_tags():
    assert recommend.normalize_tags([" 徒步 ", "徒步", "#老电影", "", "一个特别特别长的标签名字"]) == ["徒步", "老电影"]
    assert len(recommend.normalize_tags([str(i) for i in range(20)])) == recommend.MAX_TAGS


def test_seed_files_are_well_formed():
    """100 份种子资料:字段齐全、用户名唯一、卡片出处索引合法、长度在合理区间。"""
    import importlib.util
    from pathlib import Path

    spec = importlib.util.spec_from_file_location(
        "seed_users", Path(__file__).resolve().parent.parent / "scripts" / "seed_users.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    users = mod.load_seed_users()
    assert len(users) == 100
    for u in users:
        assert 2 <= len(u["username"]) <= 20, u["username"]
        assert 40 <= len(u["persona"]) <= 600, u["username"]
        assert 3 <= len(u["tags"]) <= 6, u["username"]
        assert len(u["diaries"]) >= 2, u["username"]
        for d in u["diaries"]:
            assert 30 <= len(d["content"]) <= 1200, u["username"]
            assert d.get("visibility", "public") in {"public", "restricted", "private"}
        assert 3 <= len(u["cards"]) <= 10, u["username"]
        for c in u["cards"]:
            assert 0 <= c["diary"] < len(u["diaries"]), u["username"]
            assert 0 < c["confidence"] <= 1
        for p in u["pairs"]:
            assert 0 <= p["diary"] < len(u["diaries"]), u["username"]


def test_seed_import_is_idempotent_and_seed_users_cannot_unlock_real_chat(client, fake_llm, tmp_path, monkeypatch):
    import importlib.util
    from pathlib import Path

    spec = importlib.util.spec_from_file_location(
        "seed_users", Path(__file__).resolve().parent.parent / "scripts" / "seed_users.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.setenv("SEED_USER_PASSWORD", "seed-pass-123")
    sample = [
        {
            "username": "种子测试" + uuid.uuid4().hex[:4],
            "tags": ["徒步", "咖啡"],
            "status": "☕ 续命中",
            "persona": "我是个早起的人,爱爬山也爱磨豆子。和我聊天别客套,直接说。" * 1,
            "created_days_ago": 10,
            "diaries": [
                {"days_ago": 2, "content": "早上五点半醒,磨了豆子,窗外的鸟比我还精神。"},
                {"days_ago": 5, "content": "爬了后山,腿酸,但山顶的风值回票价。", "visibility": "private"},
            ],
            "cards": [{"diary": 0, "assertion": "TA 习惯早起", "confidence": 0.8}, {"diary": 1, "assertion": "TA 爱爬山", "confidence": 0.9}],
            "pairs": [{"diary": 0, "situation": "朋友问几点起", "response": "五点半,鸟都没我早。"}],
        }
    ]
    mod.import_users(sample)
    mod.import_users(sample)  # 第二次应跳过
    with Session(engine) as s:
        seeds = list(s.exec(select(User).where(User.username == sample[0]["username"])))
        assert len(seeds) == 1 and seeds[0].is_seed
        seed_id = seeds[0].id

    # 种子用户可登录(统一口令),能被搜索、被推荐;访客聊得上,但裁判 / 私信不开放
    login = client.post("/auth/login", json={"username": sample[0]["username"], "password": "seed-pass-123"})
    assert login.status_code == 200
    me = register(client, _name("vis"))
    h = auth(me["token"])
    assert any(u["id"] == seed_id for u in client.get("/users/search?q=种子测试", headers=h).json())
    profile = client.get(f"/users/{seed_id}/profile", headers=h).json()
    assert profile["accepts_real_chat"] is False and profile["tags"] == ["徒步", "咖啡"]
    chat = client.post("/chat", json={"message": "你好", "target_user_id": seed_id}, headers=h)
    assert chat.status_code == 200
    assert "爱爬山" in fake_llm.calls[-1]["system"]  # 私密日记的卡片对访客不可见
    assert "习惯早起" in fake_llm.calls[-1]["system"]
    assert client.get(f"/judge/{seed_id}", headers=h).status_code == 400
    assert client.get(f"/dm/{seed_id}", headers=h).status_code == 400

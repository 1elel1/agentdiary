import uuid

from app import ratelimit

from .conftest import auth, register


def _name(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:6]}"


def test_health_and_root(client):
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/").json()["health"] == "/health"


def test_register_login_me(client):
    name = _name("u")
    res = register(client, name)
    assert res["username"] == name
    me = client.get("/auth/me", headers=auth(res["token"]))
    assert me.json()["username"] == name
    login = client.post("/auth/login", json={"username": name, "password": "secret123"})
    assert login.status_code == 200
    bad = client.post("/auth/login", json={"username": name, "password": "wrong"})
    assert bad.status_code == 401


def test_register_is_rate_limited_per_ip(client):
    for _ in range(5):
        register(client, _name("flood"))
    r = client.post("/auth/register", json={"username": _name("flood"), "password": "secret123"})
    assert r.status_code == 429
    ratelimit._buckets.clear()


def test_persona_roundtrip_and_validation(client):
    me = register(client, _name("p"))
    h = auth(me["token"])
    assert client.get("/users/me/persona", headers=h).json()["persona"] is None

    r = client.put("/users/me/persona", json={"persona": "  我是个话少但认真的人。\n别聊星座。  "}, headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["persona"] == "我是个话少但认真的人。\n别聊星座。"
    assert body["updated_at"] is not None
    assert body["max_chars"] == 600

    too_long = client.put("/users/me/persona", json={"persona": "啊" * 601}, headers=h)
    assert too_long.status_code == 422

    # 别人搜到我时看到单行摘要,在资料页看到全文(/users 不再罗列陌生人)
    other = register(client, _name("o"))
    users = client.get(f"/users/search?q={me['username']}", headers=auth(other["token"])).json()
    mine = next(u for u in users if u["id"] == me["user_id"])
    assert mine["persona_excerpt"] == "我是个话少但认真的人。 别聊星座。"
    profile = client.get(f"/users/{me['user_id']}/profile", headers=auth(other["token"])).json()
    assert profile["persona"] == "我是个话少但认真的人。\n别聊星座。"
    assert profile["card_count"] == 0

    cleared = client.put("/users/me/persona", json={"persona": ""}, headers=h)
    assert cleared.json()["persona"] is None
    assert cleared.json()["updated_at"] is None


def test_diary_pipeline_cards_and_cascade_delete(client, fake_llm):
    me = register(client, _name("d"))
    h = auth(me["token"])
    r = client.post("/diaries", json={"content": "今天复习到凌晨,考试真的让人焦虑。"}, headers=h)
    assert r.status_code == 200
    diary_id = r.json()["id"]
    # TestClient 会在响应后同步跑完 BackgroundTasks,卡片此时应已入库
    cards = client.get("/persona-cards", headers=h).json()
    assert len(cards) == 1 and cards[0]["source_diary_id"] == diary_id
    assert client.get(f"/users/{me['user_id']}/profile", headers=h).json()["card_count"] == 1

    assert client.delete(f"/diaries/{diary_id}", headers=h).status_code == 200
    assert client.get("/persona-cards", headers=h).json() == []


def test_chat_cold_start_uses_persona_when_no_cards(client, fake_llm):
    me = register(client, _name("c"))
    h = auth(me["token"])
    r = client.post("/chat", json={"message": "你好"}, headers=h)
    assert r.status_code == 200
    assert "还没写过日记" in fake_llm.calls[-1]["system"]

    client.put("/users/me/persona", json={"persona": "我是夜猫子,喜欢聊电影。"}, headers=h)
    client.post("/chat", json={"message": "你是谁"}, headers=h)
    system = fake_llm.calls[-1]["system"]
    assert "夜猫子" in system and "对外形象" in system


def test_visitor_chat_injects_persona_and_respects_private_diaries(client, fake_llm):
    owner = register(client, _name("own"))
    visitor = register(client, _name("vis"))
    oh, vh = auth(owner["token"]), auth(visitor["token"])
    client.put("/users/me/persona", json={"persona": "我偏内向,但聊到徒步会很来劲。"}, headers=oh)
    # 一篇公开、一篇仅自己:访客只应拿到公开那篇衍生的卡片
    fake_llm.cards = [{"assertion": "TA 周末常去徒步", "confidence": 0.9}]
    client.post("/diaries", json={"content": "周末又去爬山了,腿酸但很爽。", "visibility": "public"}, headers=oh)
    fake_llm.cards = [{"assertion": "TA 偷偷在看心理医生", "confidence": 0.9}]
    client.post("/diaries", json={"content": "今天第三次去见咨询师。", "visibility": "private"}, headers=oh)

    r = client.post("/chat", json={"message": "嗨,你是怎样的人?", "target_user_id": owner["user_id"]}, headers=vh)
    assert r.status_code == 200
    system = fake_llm.calls[-1]["system"]
    assert "徒步会很来劲" in system  # 对外形象注入
    assert "周末常去徒步" in system  # 公开日记的卡片
    assert "心理医生" not in system  # 私密日记的卡片不得泄露给访客
    assert "不透露具体人名" in system
    assert "他" not in system.replace("其他", "").replace("他人", "")  # 不猜性别

    # 历史按 (主人, 访客) 对隔离:主人自聊看不到访客的对话
    hist_owner = client.get("/chat/history", headers=oh).json()
    assert hist_owner == []
    hist_visitor = client.get(f"/chat/history?target_user_id={owner['user_id']}", headers=vh).json()
    assert [m["role"] for m in hist_visitor] == ["user", "avatar"]


def test_chat_llm_failure_returns_503_and_persists_nothing(client, fake_llm):
    me = register(client, _name("f"))
    h = auth(me["token"])
    fake_llm.fail = True
    r = client.post("/chat", json={"message": "在吗"}, headers=h)
    assert r.status_code == 503
    assert "化身暂时下线" in r.json()["detail"]
    assert client.get("/chat/history", headers=h).json() == []


def test_chat_rejects_blank_message(client):
    me = register(client, _name("b"))
    r = client.post("/chat", json={"message": "   "}, headers=auth(me["token"]))
    assert r.status_code == 422


def test_reply_language_follows_client_header(client, fake_llm):
    me = register(client, _name("lang"))
    h = auth(me["token"])
    client.post("/chat", json={"message": "hi"}, headers=h)
    assert "用中文" in fake_llm.calls[-1]["system"]
    client.post("/chat", json={"message": "hi"}, headers={**h, "X-Language": "en"})
    assert "用英文" in fake_llm.calls[-1]["system"]
    client.post("/chat", json={"message": "hi"}, headers={**h, "X-Language": "xx"})
    assert "用中文" in fake_llm.calls[-1]["system"]  # 认不出的语言回落中文
    # 名人化身:非中文时附加一句回复语言要求
    users = client.get("/users", headers=h).json()
    luxun = next(u for u in users if u["username"] == "鲁迅")
    client.post("/chat", json={"message": "hello", "target_user_id": luxun["id"]}, headers={**h, "X-Language": "ja"})
    assert "用日文回应" in fake_llm.calls[-1]["system"]


def test_recommend_reason_follows_language():
    from datetime import datetime, timezone

    from app.models import User
    from app.recommend import score_candidate

    now = datetime.now(timezone.utc)
    u = User(username="x", password_hash="", public_persona="hi")
    me_tags = {"电影", "徒步"}
    _, zh = score_candidate(me_tags, u, ["电影", "养猫"], 3, None, now)
    assert zh == "你们都在意 「电影」"
    _, en = score_candidate(me_tags, u, ["电影", "养猫"], 3, None, now, lang="en")
    assert en == "You both care about \u201c电影\u201d"
    _, ko = score_candidate(me_tags, u, ["养猫"], 3, None, now, lang="ko")
    assert ko == "키워드: 养猫"
    _, ja = score_candidate(me_tags, u, [], 3, None, now, lang="ja")
    assert ja == "自己紹介を書いている"
    # 认不出来的语言回落简体中文
    _, unknown = score_candidate(me_tags, u, [], 3, None, now, lang="xx")
    assert unknown == "TA 写了自我介绍"


def test_diary_defaults_private_and_training_gate(client, fake_llm):
    me = register(client, _name("g"))
    h = auth(me["token"])
    # 默认私密
    d = client.post("/diaries", json={"content": "今天很累,但把该做的做完了。"}, headers=h).json()
    assert d["visibility"] == "private"
    assert d["use_for_twin"] is True
    cards = client.get("/persona-cards", headers=h).json()
    assert len(cards) == 1 and cards[0]["kind"] == "mood"

    # 「只保存,不用于化身」:不蒸馏
    fake_llm.cards = [{"assertion": "TA 关注某条法规", "kind": "stable", "confidence": 0.9}]
    pasted = client.post(
        "/diaries", json={"content": "第一条 为了规范…… 第二条 本办法适用于……", "use_for_twin": False}, headers=h
    ).json()
    assert pasted["use_for_twin"] is False
    assert len(client.get("/persona-cards", headers=h).json()) == 1
    listed = {x["id"]: x for x in client.get("/diaries", headers=h).json()}
    assert listed[d["id"]]["card_count"] == 1
    assert listed[pasted["id"]]["card_count"] == 0

    # 事后打开闸门 → 蒸馏;再关掉 → 衍生物清空
    on = client.patch(f"/diaries/{pasted['id']}", json={"use_for_twin": True}, headers=h).json()
    assert on["use_for_twin"] is True
    assert len(client.get("/persona-cards", headers=h).json()) == 2
    off = client.patch(f"/diaries/{pasted['id']}", json={"use_for_twin": False}, headers=h).json()
    assert off["use_for_twin"] is False and off["card_count"] == 0
    assert len(client.get("/persona-cards", headers=h).json()) == 1


def test_guess_cards_shown_but_not_injected(client, fake_llm):
    me = register(client, _name("k"))
    h = auth(me["token"])
    fake_llm.cards = [
        {"assertion": "TA 喜欢一个人看电影", "kind": "stable", "confidence": 0.9},
        {"assertion": "TA 可能对新工作不太满意", "kind": "guess", "confidence": 0.3},
    ]
    client.post("/diaries", json={"content": "又一个人去看了电影。新工作说不上来。"}, headers=h)
    cards = client.get("/persona-cards", headers=h).json()
    assert {c["kind"] for c in cards} == {"stable", "guess"}
    fake_llm.calls.clear()
    client.post("/chat", json={"message": "你好"}, headers=h)
    system = fake_llm.calls[-1]["system"]
    assert "TA 喜欢一个人看电影" in system
    assert "TA 可能对新工作不太满意" not in system


def test_exclude_persona_card(client, fake_llm):
    me = register(client, _name("x"))
    h = auth(me["token"])
    client.post("/diaries", json={"content": "考试前总是睡不好。"}, headers=h)
    cards = client.get("/persona-cards", headers=h).json()
    assert len(cards) == 1
    r = client.delete(f"/persona-cards/{cards[0]['id']}", headers=h)
    assert r.status_code == 200
    assert client.get("/persona-cards", headers=h).json() == []
    # 别人的卡片删不掉(也不暴露存在性)
    other = register(client, _name("y"))
    client.post("/diaries", json={"content": "今天跑了五公里。"}, headers=auth(other["token"]))
    theirs = client.get("/persona-cards", headers=auth(other["token"])).json()[0]
    assert client.delete(f"/persona-cards/{theirs['id']}", headers=h).status_code == 404

"""测试夹具:临时数据目录 + 打桩的 LLM。

在导入 app 之前设置 AGENTDIARY_DATA_DIR,否则 config 模块会把库建到 server/ 下。
"""

import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="agentdiary-test-")
os.environ["AGENTDIARY_DATA_DIR"] = _tmp
os.environ["LEGACY_PASSWORD"] = "legacy-test-password"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import llm, ratelimit  # noqa: E402
from app.main import app  # noqa: E402


class FakeLLM:
    """记录每次调用的 system prompt,便于断言 prompt 里注入了什么。"""

    def __init__(self):
        self.calls: list[dict] = []
        self.reply = "嗯,差不多就是这样。"
        self.fail = False
        # 下一次蒸馏要抽出的卡片;用例按需改它(替换方法本身不生效,fixture 已绑定)
        self.cards = [{"assertion": "TA 最近在为考试焦虑", "confidence": 0.8}]
        # 标签提炼的返回
        self.tags = ["考试", "焦虑"]

    def chat_messages(self, system, messages, *, profile=None, json_mode=False, timeout=300.0, max_tokens=None):
        if self.fail:
            raise llm.LLMError("模拟的服务不可用")
        self.calls.append({"system": system, "messages": messages, "profile": profile})
        return self.reply

    def chat(self, system, prompt, *, profile=None, json_mode=False, timeout=300.0):
        self.calls.append({"system": system, "messages": [{"role": "user", "content": prompt}], "profile": profile})
        return "朋友问起最近怎么样"

    def chat_json(self, system, prompt, *, profile=None):
        self.calls.append({"system": system, "messages": [{"role": "user", "content": prompt}], "profile": profile})
        if "标签" in system:
            return {"tags": list(self.tags)}
        return {"cards": list(self.cards)}


@pytest.fixture
def fake_llm(monkeypatch):
    fake = FakeLLM()
    monkeypatch.setattr(llm, "chat_messages", fake.chat_messages)
    monkeypatch.setattr(llm, "chat", fake.chat)
    monkeypatch.setattr(llm, "chat_json", fake.chat_json)
    return fake


@pytest.fixture
def client(fake_llm):
    # 限流桶是进程级的,测试之间清掉,免得注册限流把后面的用例挡住
    ratelimit._buckets.clear()
    with TestClient(app) as c:
        yield c
    ratelimit._buckets.clear()


def register(client: TestClient, username: str, password: str = "secret123") -> dict:
    r = client.post("/auth/register", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}

"""客户端界面语言(X-Language 请求头)。

客户端把界面语言放在 X-Language 里(zh-Hans / zh-Hant / en / ja / ko)。后端据此:
- 让化身用这种语言回复(routers/chat.py 把它写进 system prompt);
- 翻译少数由服务端生成、直接展示给用户的短文案(推荐理由,recommend.py)。
认不出来一律当简体中文。接口错误信息(detail)仍是中文,属已知待办。
"""

from fastapi import Request

LANGUAGE_CODES = ("zh-Hans", "zh-Hant", "en", "ja", "ko")
DEFAULT_LANGUAGE = "zh-Hans"


def client_language(request: Request | None) -> str:
    """请求头里的界面语言代码;缺省或不认识 → zh-Hans。"""
    code = (request.headers.get("X-Language", "") if request is not None else "").strip()
    return code if code in LANGUAGE_CODES else DEFAULT_LANGUAGE

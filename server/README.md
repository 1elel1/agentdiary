# AgentDiary 后端(FastAPI)

日记 CRUD + 蒸馏 pipeline v1(逆向对话对 + 人格卡片)+ 化身对话(自聊 / 访客)+
对外形象 + AI 裁判 + 解锁后的真人私信。单进程 uvicorn + SQLite。

## 首次安装

```powershell
cd server
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt pytest
```

## 启动

```powershell
cd server
.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

`--host 0.0.0.0` 必须,否则 iPad 无法通过局域网访问。
交互式 API 文档:http://localhost:8000/docs

## 测试

```bash
cd server && .venv/bin/python -m pytest
```

`tests/` 用 FastAPI TestClient 跑完整请求链路,LLM 用桩替代(不花钱、不联网),
数据库建在临时目录。覆盖:注册/登录/限流、对外形象读写与校验、日记 → 蒸馏 →
卡片 → 级联删除、自聊/访客 prompt 的注入内容与隐私边界、LLM 挂掉时的 503。
`deploy/deploy.sh` 部署前会先跑它。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /auth/register · /auth/login · /auth/logout | 注册(5 个/小时/IP)、登录(10 次/10 分钟/IP)、登出 |
| GET | /auth/me | 当前用户 |
| GET | /users | 「门面」:名人化身 + 我聊过的人。**不再罗列全站用户** |
| GET | /users/search?q= | 按用户名搜索(包含匹配,≤20 条;120 次/小时) |
| GET | /users/recommended?limit&tag&seed | 为你推荐:标签重合 ×3 + 有对外形象 + 卡片数 + 近 7 天写过日记 + 当日状态,带推荐理由;seed 换一批 |
| GET | /users/tags | 热门兴趣标签(筛选条) |
| GET | /users/recent | 最近聊过的化身(带最后一句预览) |
| GET | /users/{id}/profile | 化身资料页:对外形象全文、状态、卡片数 |
| GET | /users/{id}/avatar | 头像(不鉴权,uuid 路径不可猜) |
| GET/PUT | /users/me/persona | **对外形象**(≤ 600 字;空 = 清除) |
| GET/PUT | /users/me/status | 今日状态(24 小时过期) |
| PUT | /users/me/username · /users/me/password · /users/me/avatar | 改名 / 改密(吊销其他设备)/ 头像(base64,≤ 8MB) |
| DELETE | /users/me | 注销账号,级联删除全部数据(需密码) |
| GET/POST | /diaries | 日记列表 / 写日记(触发后台蒸馏;20 篇/天) |
| PUT | /diaries/{id} | 改内容(落笔 24 小时内;旧衍生数据作废并重蒸馏) |
| PATCH | /diaries/{id} | 改可见性(public / restricted + 白名单 / private)、手势锁标记 |
| GET | /diaries/{id}/allowed | restricted 白名单 |
| POST | /diaries/{id}/distill | 手动重跑蒸馏 |
| DELETE | /diaries/{id} | 删除日记(级联删除对话对与卡片) |
| POST | /chat | 与化身对话(不传 target_user_id = 自聊;30 条/小时)。LLM 不可用返回 503 |
| GET | /chat/history | 对话历史,按 (化身主人, 访客) 隔离;limit ≤ 200 |
| GET | /persona-cards | 自己的人格卡片(含出处日记 id) |
| GET/POST | /judge/{id} · /judge/{id}/evaluate | AI 裁判状态 / 评估(≥ 5 句才能评,≥ 70 分解锁) |
| GET/POST | /dm · /dm/{id} | 已解锁的真人会话列表 / 收发私信 |
| GET | /health | 健康检查 |

**新增顶级路由时同步 `deploy/nginx-agentdiary.conf` 的正则**,否则请求落到静态站。

所有接口可带请求头 `X-Language`(`zh-Hans` / `zh-Hant` / `en` / `ja` / `ko`;`app/i18n.py`,缺省或不认识 = zh-Hans):
`/chat` 据此让化身用该语言回复(名人化身只换语言不换口吻),`/users/recommended` 的推荐理由按它选模板。
接口错误 `detail` 目前仍是中文。

## 兴趣标签与推荐

`app/recommend.py`。每个用户有 3~6 个短标签(`User.tags_json`):真实用户由 DISTILL 档从
「对外形象 + 最近 30 张卡片」提炼(蒸馏出新卡片、或改了对外形象后在后台跑,失败只记日志);
种子用户在资料里直接给定。推荐 = 打分取前 3×limit 再按 seed 打乱取 limit,所以「换一批」
是高分池里的随机子集。理由写给用户看,只用公开信息(「你们都在意「徒步」「老电影」」);理由模板随请求头 `X-Language` 切换,标签本身不翻译。
这不是 CLAUDE.md §3 说的向量匹配引擎,只是发现页的可解释排序。

## 种子用户

`seed/users-*.json` 里是 100 份人工撰写的资料(用户名、对外形象、标签、状态、3 篇日记、
5~6 张卡片、3 组对话范例),覆盖不同年龄、城市、职业与性格。导入:

```bash
cd server && .venv/bin/python scripts/seed_users.py           # 幂等,已存在的跳过
.venv/bin/python scripts/seed_users.py --count                 # 数量统计
.venv/bin/python scripts/seed_users.py --purge                 # 删除全部种子用户及衍生数据
```

- 统一口令:环境变量 `SEED_USER_PASSWORD`,否则读/生成数据目录下的 `seed-password.txt`(600),
  **不打印**。服务器上:`sudo cat /var/lib/agentdiary/seed-password.txt`
- 种子用户 `is_seed=1`:可登录、可被搜索/推荐、可访问其化身;**裁判与真人私信不开放**
  (资料页 `accepts_real_chat=false`,客户端隐藏裁判入口)
- 不跑 LLM 蒸馏,卡片与范例直接入库,不花 token
- 通过 GitHub Actions 导入:提交信息带 `[deploy] [task:seed-users]`(见 deploy/README.md)

`scripts/reset_password.py <用户名>`:重置任意账号密码(口令是哈希,找不回只能重置)。

## 化身 prompt 的三路输入

| 输入 | 来源 | 决定什么 |
|---|---|---|
| 人格卡片 | 日记蒸馏(带置信度与出处) | 说的是不是真的:观点、偏好、经历都要有卡片依据 |
| 说话范例 | 日记切片逆向构造的对话对 | 怎么说话:句长、语气词、收尾方式。**只在自聊注入**(含日记原话) |
| 对外形象 | 用户在「我 → 对外形象」亲自写 | 怎么呈现:先聊什么、什么语气、避开什么。访客模式注入,自聊也带上 |

访客只拿得到 public 日记(或 restricted 且对其开放的日记)衍生的卡片;prompt 明确
禁止复述日记原文与可识别的私人细节。没有卡片但有对外形象时,化身靠它撑起对话
(冷启动不再只会说「我一无所知」)。

## LLM 接入

`app/llm.py` 统一走 OpenAI 兼容协议(`/v1/chat/completions`)。千问百炼、Ollama、
vLLM 都实现这个协议,换模型只改环境变量,请求体不动。

分两套独立配置,因为两件活对模型的要求不同:

| 档 | 用在哪 | 该用什么 |
|---|---|---|
| `DISTILL` | 蒸馏抽卡片、构造对话对、AI 裁判 | 最强通用模型。产出训练素材,质量决定后续 LoRA 上限 |
| `CHAT` | 化身对话 | 现借通用模型跑通 Phase 0;将来换成自己 LoRA 微调的基座 |

**不设任何环境变量时全部回退到本地 Ollama**(`qwen3.5:9b`),原有开发流程照常,
只需确保 Ollama 在运行。切到千问百炼:

```powershell
# 用户级永久变量,设完要重开终端。API Key 绝不写进代码或 git
[Environment]::SetEnvironmentVariable("DASHSCOPE_API_KEY", "sk-...", "User")
[Environment]::SetEnvironmentVariable("DISTILL_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1", "User")
[Environment]::SetEnvironmentVariable("DISTILL_MODEL", "qwen3.7-plus", "User")
[Environment]::SetEnvironmentVariable("CHAT_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1", "User")
[Environment]::SetEnvironmentVariable("CHAT_MODEL", "qwen3.7-plus", "User")
```

服务器上则写进 systemd 的 `EnvironmentFile`(权限 600)。

`LLM_MONTHLY_TOKEN_BUDGET` 可选:设成月度 token 上限,超了拒绝调用。`ratelimit.py`
挡的是单人滥用,这个挡的是总量超支(20 个用户各聊 30 轮同样能烧穿预算)。
进程内计数、重启归零,真实对账看日志里每次调用的 `usage` 行。

- 写日记 → FastAPI BackgroundTasks 后台蒸馏(逆向构造对话对 + 抽取人格卡片),
  完成后卡片才会出现;蒸馏日志在 **数据目录** 的 `distill.log`(随
  `AGENTDIARY_DATA_DIR` 外置,不在代码目录)
- 化身对话 → 按新近度检索人格卡片 + 对外形象注入 system prompt 生成回应

## 数据目录

`AGENTDIARY_DATA_DIR`(默认 `server/`,**部署时必须指到代码目录之外**):
`agentdiary.db`、`avatars/`、`distill.log`。备份见 `deploy/backup-db.sh`。

## 待接入(按 CLAUDE.md §2)

- 人格卡片向量检索(现为新近度排序)+ 断言覆盖机制
- 对话对喂给 LoRA 微调;DPO 校准环
- 蒸馏/训练任务升级为正式队列
- 存储加密

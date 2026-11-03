# AgentDiary — 交接速查

> 2026-11-03 建,2026-11-03 v4.3 迭代后更新。这份文件是为了让另一个 session
> (或几周后的你)不用翻聊天记录就能接着干。只记事实和踩过的坑,不记过程。
> 每次迭代在文末「迭代记录」追加一段,Notion「AgentDiary」页同步一份。

## 凭据在哪(不在本文件里)

本文件进 git,所以不写任何口令。

| 凭据 | 位置 |
|---|---|
| 千问 API Key | 服务器 `/etc/agentdiary.env`(root:root 600) |
| SSH 私钥 | 本机 `~/.ssh/test.pem`,别名 `ssh agentdiary` |
| 演示账号 `test` 的口令 | Notion「AgentDiary — 云端部署与运维速查」页 |
| 100 个种子用户的统一口令 | 服务器 `/var/lib/agentdiary/seed-password.txt`(600;首次导入时自动生成) |

密码一律 PBKDF2 加盐哈希,**找不回,只能重置**:`cd server && .venv/bin/python scripts/reset_password.py <用户名>`。

## 访问地址

| 用途 | 地址 |
|---|---|
| API + 网页版(同域名) | `https://43.130.127.226.sslip.io` |
| 健康检查 / 接口文档 | `/health` · `/docs` |
| 代码仓库 | https://github.com/1elel1/agentdiary (分支 `main`;功能分支合并前先部署到服务器验证) |
| EAS 构建面板 | https://expo.dev/accounts/1iyi1/projects/agentdiary |

网页版 = Expo 工程导出的静态站,浏览器打开就是完整前端,不用装 App,
连的是同一个后端和同一份数据。

## 服务器

腾讯云轻量,**美国弗吉尼亚节点**(非国内,所以挂域名不需要 ICP 备案)。

```
代码        /home/ubuntu/agentdiary
数据        /var/lib/agentdiary      ← DB + 头像 + distill.log,在代码目录之外
静态站      /var/www/agentdiary
环境变量    /etc/agentdiary.env      (600)
服务        systemd: agentdiary-api  (系统级,开机自启)
证书        Let's Encrypt,certbot.timer 自动续期(续期演练已验证)
备份        /var/backups/agentdiary  (deploy/backup-db.sh + cron,见 deploy/README.md)
```

```bash
cd /home/ubuntu/agentdiary && bash deploy/deploy.sh        # 一键部署 main(先跑测试,再重启)
sudo systemctl status agentdiary-api
sudo journalctl -u agentdiary-api -n 100 --no-pager
```

**同机还有三个站点**,改 nginx 时别碰到:`dazi`(monash-dazi.duckdns.org)、
`offline-aid`(aid.…sslip.io,有 basic auth)、`travelingmate`(tm.…sslip.io)。

## LLM

走 OpenAI 兼容协议(`/v1/chat/completions`),千问 / Ollama / vLLM 都实现它,
换模型只改环境变量。分两档:

| 档 | 用在哪 | 为什么分开 |
|---|---|---|
| `DISTILL` | 蒸馏抽卡片、构造对话对、AI 裁判 | 分析类任务,产出训练素材,质量决定 LoRA 上限,一直用最强模型 |
| `CHAT` | 化身对话 | 现借通用模型跑通 Phase 0;将来换成自己微调的基座,只改这三个变量 |

当前两档都是 `qwen3.7-plus`。价格 ¥1.6 输入 / ¥6.4 输出(每百万 token,
限时 8 折,到期回 ¥2/¥8)。

换千问解决的真问题:本地 9B 长期抽不出人格卡片(日志里一片空结果),
换档后同一篇日记抽出 5 张高质量卡片。

## 三条不能动的约束

1. **绝不加 `--workers`** — SQLite 写并发、`ratelimit.py` 的进程内计数、
   蒸馏用的 BackgroundTasks,三样都依赖单进程
2. **uvicorn 只绑 `127.0.0.1`** — 公网入口只能是 nginx
3. **nginx `client_max_body_size` ≥ 12m** — 头像上限 8MB 且走 base64
   (膨胀 1.33 倍),默认 1m 直接 413

`proxy_read_timeout 300s` 同理:蒸馏和对话都是长请求,默认 60s 会截断。

## 踩过的坑

每条都真实消耗过时间。再遇到能直接对号入座。

| 现象 | 真实原因 |
|---|---|
| App 报 404,以为接口没了 | **ngrok 隧道离线返回 404**,和「接口不存在」长得一样 |
| 裸 IP 访问突然 404 | **certbot `--redirect`** 按 server_name 匹配,裸 IP 落不到任何 server 块 |
| APK 装上报 Network request failed | **Android 9+ 禁止明文 HTTP**,请求根本没离开手机(服务器日志里一条都没有) |
| HTTPS 本机通、外网不通 | **腾讯云安全组**没放行 443(在虚拟机之外,iptables 里看不到) |
| 网页 `/chats` 打不开 | nginx 前缀 `location /chat` 把 `/chats` 一起吃了,要用 `(/|$)` 边界的正则 |
| 注销按钮在 Android 没反应 | **`Alert.prompt` 只在 iOS 有效**,Android 上静默什么都不做 |
| 切页后导航亮度卡在上一页 | 开了 `reactCompiler` 后 `useAnimatedStyle` 的闭包不随重渲染刷新 |
| 静态样式被动画样式覆盖 | 同一个 `style` 数组是覆盖不是相乘,必须两层嵌套 |
| 点条纹没反应 | `minDistance(0)` 让 Pan 触地即激活,吞掉子级 Pressable 的点按 |
| nginx 报 `unknown directive http2` | nginx 1.24 要写 `listen 443 ssl http2`,`http2 on;` 是 1.25+ |

**新增后端路由时必须同步 nginx 的正则**,否则请求落到静态站返回 index.html
——症状是接口莫名返回一坨 HTML,很难一眼看出来。详见 `deploy/README.md`。

## 待办(按优先级)

### 1. v4.0 → v4.3 都已通过 Actions 部署到服务器,待真机验收与合并

**已完成**:GitHub Actions「Deploy to server」把 v4.0(2026-11-03 11:24 UTC)、v4.1(13:14 UTC)、
v4.2(见文末迭代记录)依次部署到服务器:rsync 同步代码 → 在服务器跑 pytest → 重启 API →
公网健康检查。secret `DEPLOY_SSH_KEY` 已配好,以后部署:提交信息带 `[deploy]` 再 push(main / claude/** / deploy/** 分支),
或 `git tag deploy-xxx && git push origin deploy-xxx`,或工作流进 main 后在 Actions 页点 Run workflow。

**还没做**:
1. 浏览器打开 https://43.130.127.226.sslip.io 过一遍:登录 → 写一篇(默认仅自己;粘一段网页试试「仅保存,不用于化身」)→ 日记卡片「…」→ 对话(我的化身 → 检验它像不像你 → 开场问题)→ 人格卡片(分组 / 查看来源 / 排除)→ 我 → 语言切换(旧标签页先强刷)
2. 没问题就合进 main(见下)
3. App 端 OTA(需要本机 Expo 登录,云端 session 做不了)

手动兜底(注意:服务器上的 `/home/ubuntu/agentdiary` **不是 git 仓库**,当初是直接传上去的目录,
所以 `deploy.sh` 的 git 拉取模式在那里用不了;Actions 对它走的是 rsync 同步):

```bash
ssh agentdiary
cd /home/ubuntu/agentdiary && NO_GIT=1 bash deploy/deploy.sh
```

验完合进 main 并发 App 端 OTA:

```bash
git checkout main && git merge --ff-only claude/brave-volta-zbr8b5 && git push
cd client && eas update --channel preview --message "v4.3 trust-first + i18n + discover"
```

真机重点看:底部 Tab 在刘海屏的安全区、聊天页键盘弹起时输入条位置(Android 带
导航头的页面走的是手动垫底逻辑)、长按日记卡片的面板、深色模式。

### 2. 设月度 token 闸门(没做)

现在没上限。注册接口开放 + 公网持续被扫,有人刷 `/chat` 就是刷钱。

```bash
sudo sh -c 'echo "LLM_MONTHLY_TOKEN_BUDGET=3000000" >> /etc/agentdiary.env' && sudo systemctl restart agentdiary-api
```

300 万 token ≈ ¥6~10。注意:计数在进程内,重启归零,挡的是「单次失控」
不是严格月度上限。硬保险还得去阿里云控制台设费用预警。

### 3. 数据库备份(脚本有了,cron 还没装)

脚本 `deploy/backup-db.sh` 已写好(sqlite3 `.backup` 在线快照 + 头像打包,保留 14 天)。
服务器上装一次 cron 即可,见 `deploy/README.md`「数据库备份」。库里已有 18 篇真实
日记、29 张人格卡片,装之前一份备份都没有。

### 4. 走完 iOS 提交

```bash
cd client && eas submit --profile production --platform ios
```

之前卡在中途。Apple 处理 5~30 分钟后,用 TestFlight 群组里那个 Apple ID
登录即可看到。内测不过审,上限 100 人。

## 成本

| | 计费 | 忘了会怎样 |
|---|---|---|
| 腾讯云轻量 | 预付费 | 到期**停机**,不累积欠费 |
| 阿里云百炼 | 按量,**目前无上限** | 有人调用就一直扣,**会累积** |
| Apple Developer | $99/年**自动续订** | 最容易忘 |

免费:`sslip.io` 泛解析、Let's Encrypt、GitHub、EAS 免费额度、网页版托管。

## 上架还差几步

**距 TestFlight:1 步** — 走完 `eas submit`。

**距 App Store:约 7 步** — 买域名(`sslip.io` 绑死 IP,**IP 一变所有已装
App 失联**,修复要重新过审)、隐私政策 URL、App 隐私标签(需声明数据处理方
在中国境内)、截图+描述+分类+年龄分级、张爱玲形象权(标注「AI 模拟」或移除)、
举报/屏蔽机制(Phase 2 触发)、数据库备份。

### 但真正卡住的不是这 7 步

`CLAUDE.md` 定的 Phase 0 门槛是**盲测通过率 ≥ 60%**(「这是不是我会说的话」),
**这个数一次都还没测过**。

技术上离上线很近,产品上还没验证核心假设。7 步全做完、审核也过了,
如果化身不像你,产品仍然不成立。

建议顺序:进 TestFlight → 自己用几天做盲测 → 通过率上不去就回到蒸馏和 prompt
(或上 LoRA)→ 过了 60% 再花时间买域名、写隐私政策、截图上架。

## 相关文件

- `deploy/README.md` — 一键部署脚本、GitHub Actions 部署、备份、nginx 正则的维护陷阱、云防火墙排查
- `.github/workflows/deploy.yml` — Actions 部署工作流(手动触发;需要 secret `DEPLOY_SSH_KEY`)
- `server/README.md` — 接口表、化身 prompt 的三路输入、LLM 两档配置、测试
- `CLAUDE.md` — 产品定位、技术方案、阶段门槛、隐私红线、客户端 UI 约定

## 迭代记录

### v4.3 · 2026-11-03 · 信任主线:默认私密、训练闸门、可控的化身理解(采纳外部评审)

**已部署**:2026-11-03 16:20 UTC,Actions 第 10 次运行全绿
(https://github.com/1elel1/agentdiary/actions/runs/41672707216):服务器在提交 `d8ae8949`,21 个测试在服务器上通过,
迁移新增 `diaryentry.use_for_twin`、`personacard.kind`,部署后任务回填种子卡片 kind=stable 共 600 张。
(第 9 次运行部署本身成功、后置任务因脚本 sys.path 失败,第 10 次修复后重跑。)未合并 main,等真机验收。

**来源**:用户给的另一份 AI 评审(`CLOUD_V4_2_UX_PRODUCT_REVIEW.md`,未入库)。采纳了它的 P0 和大部分旅程建议,
没采纳「把发现页 / 名人化身 / 对外形象从 Phase 0 导航里撤掉」:这些是用户点名做的既成功能(CLAUDE.md §3),
处理方式是让「我的化身」成为对话页的主角,社交发现排在后面。

**P0:信任与数据质量**
- 日记正文不再进路由参数:编辑页只带 `diaryId`,正文从本地缓存取(网页版地址栏 / 历史记录 / Referrer 曾带着全文)
- 新日记**默认仅自己**(服务端默认也改为 private);文案改为「只有你和你的化身会用到这段文字;化身不会逐字复述」
- 训练闸门:保存前用启发式(`client/lib/diary-quality.ts`:链接、版权/转载字样、条款/清单占比、第一人称密度)识别像粘贴的长文,
  弹出「仅保存,不用于化身 / 仍用于化身」;`DiaryEntry.use_for_twin`,关 = 清空衍生物并不再蒸馏,开 = 重蒸馏;卡片「…」菜单可随时切换
- 卡片 `kind`(stable / mood / guess):蒸馏 prompt 明确不把转载内容、他人观点、清单变成断言;guess 只展示给本人确认,**不注入化身 prompt**;
  mood 在 prompt 里标「近期状态」;改用无性别的「TA」
- 单条理解可排除(`DELETE /persona-cards/{id}`);删除日记前提示「会同时删除 N 条理解」(`/diaries` 带 `card_count`)
- 自聊 prompt:不长篇自我介绍,被问「你是怎样的人」也只挑一点说

**旅程与质感**
- 日记:编辑器占位语按天轮换;「…」显式操作按钮(长按只是快捷方式);仅自己不再打标签,只标公开 / 指定的人 / 未用于化身;
  保存后 4 秒横幅「已私密保存 · 化身正在后台学习这篇」;「已定格」文案解释为什么以及怎么补充现在的想法
- 对话页:「我的化身」hero 卡(N 条理解在用 · M 条待确认 + 「检验它像不像你」),对外形象降为次级入口;推荐行的标签 / 卡片数移到底行,320pt 不再截断
- 自聊:三个测试型开场问题 + 换一批(空会话列出,有历史后收成输入条上方一排);头部副标题「由你的日记学习 · 不复述原文」
- 人格卡片页:按性质分组(稳定理解 / 近期状态 / 仍待确认 / 早期理解),标签 + 学到日期代替置信度进度条,来源默认收起「查看来源」,「…」→ 排除
- 「我」:人格卡片行显示理解状态而不是数量;头像底色改低饱和;打字指示尊重「减弱动态效果」;底表单行带 selected 无障碍状态;大标题副标题允许两行
- `docs/blind-test-protocol.md`:盲测题库、流程、失败归因(研究流程,不是功能)

**后端其他**
- 迁移:`diaryentry.use_for_twin`、`personacard.kind`;`backfill-card-kinds` 部署后任务把种子用户旧卡片标为 stable,真实用户旧卡片保持未分类(不花 token)
- 测试 18 → 21(默认私密与闸门、guess 不注入、排除卡片);`APP_VERSION` v4.3

**没做 / 留给下次**
- 接口错误 `detail` 仍是中文;界面语言与化身回复语言没有拆成两个设置(用文案说清了)
- 盲测仍然一次都没测:协议有了,接下来按它跑

### v4.2 · 2026-11-03 · 五种界面语言 + 化身回复语言

**已部署**:2026-11-03 14:04 UTC,Actions 第 7 次运行全绿
(https://github.com/1elel1/agentdiary/actions/runs/41649790461):服务器在提交 `cf046a6c`,
18 个测试在服务器上通过,网页版已更新,公网健康检查通过。未合并 main,等真机验收。

**界面语言(我 → 偏好 → 语言)**
- 简体中文 / 繁體中文 / English / 日本語 / 한국어,外加「跟随系统」(默认;靠 `Intl` / `navigator.language` 判断,
  不依赖 expo-localization,所以可 OTA);选择存本机(`settings-store.language`),刷新与重启后保持
- 客户端全部文案进字典 `client/lib/i18n/`:`zh-Hans.ts` 是主字典,其余四种标注为 `Dict` 类型,少一个键编译不过;
  组件里 `useT()`,非组件代码(store / `lib/format.ts` / `lib/dialog.ts`)用 `getDict()`;日期标签、周几、
  「还可修改 N 小时」这类带文字的格式也随语言;`ActionSheet` 新增 `selected` 打勾(语言单选用)
- 日记原文、用户名、兴趣标签、化身的历史消息是内容,不翻译
- 根布局等设置恢复后再出首帧,避免先闪一下默认语言

**后端**
- 新请求头 `X-Language`(`app/i18n.py`;缺省或不认识 = zh-Hans)。`/chat` 把它写进 system prompt,化身用该语言回复
  (名人化身保持口吻与思想方式,只换语言);`/users/recommended` 的推荐理由模板按它选(标签本身不翻译)
- 接口错误 `detail` 仍是中文(待办,量大且多数只在异常时出现)
- 测试 18 个(+化身回复语言、+推荐理由语言)

**其他**
- `APP_VERSION` v4.2;`lib/backgrounds.ts` 预设只放颜色,显示名在字典
- 本地验收:网页版切换五种语言各截一轮,`X-Language` 随切换变化,无控制台错误

### v4.1 · 2026-11-03 · 发现页重做 + 100 个种子用户

**已部署**:2026-11-03 13:14 UTC,Actions 第 5 次运行全绿
(https://github.com/1elel1/agentdiary/actions/runs/41642260850),服务器在提交 `8394fdaf`;
部署后任务 `seed-users` 新建 100 个种子用户,线上共 111 个用户(100 种子 + 4 名人化身 + 7 真实用户)。
统一口令已生成在服务器 `/var/lib/agentdiary/seed-password.txt`。第 4 次运行在部署后任务挂在 task.sh 的
相对路径上(部署本身成功),第 5 次修复后重跑。

**发现页(对话 Tab)**
- 不再罗列全站用户(隐私:注册即被所有人看到不合理)。`GET /users` 只返回名人化身 + 我聊过的人
- 搜索用户名(`/users/search`,包含匹配,≤20 条);「为你推荐」(`/users/recommended`):标签重合 ×3 +
  有对外形象 + 卡片数 + 近 7 天活跃,带可验证的推荐理由;标签筛选条(`/users/tags`);「换一批」换 seed
- 「最近对话」分区(`/users/recent`);本机拖动排序与置顶功能移除(与推荐/最近对话重叠)
- 兴趣标签 `User.tags_json`:蒸馏出新卡片或改对外形象后,DISTILL 档从卡片 + 对外形象提炼 3~6 个(每次约 300 token)
- 「指定的人」白名单改为搜索添加(`UserPicker`),`/diaries/{id}/allowed` 多返回 `allowed_users` 带名字

**种子用户**
- `server/seed/users-*.json`:100 份人工撰写资料(不同年龄/城市/职业/性格,各 3 篇日记、5~6 张卡片、3 组范例、标签、对外形象、状态)
- `scripts/seed_users.py` 导入(幂等)/`--purge`/`--count`;统一口令见上表;不跑 LLM,不花 token
- `is_seed` 用户:可登录、可搜索、可聊;裁判与私信返回 400「TA 还没开放真人对话」,资料页 `accepts_real_chat=false`,客户端隐藏裁判入口
- 通过 Actions 导入:提交信息 `[deploy] [task:seed-users]` → 部署完在服务器跑 `deploy/task.sh seed-users`

**其他**
- `scripts/reset_password.py`:重置任意账号密码(哈希不可逆)
- 测试增至 16 个(搜索/推荐/标签提炼/种子导入与边界/100 份资料格式校验)
- `APP_VERSION` v4.1

### v4.0 · 2026-11-03 · 前端重做 + 对外形象

**新功能:对外形象(public persona)**
- 用户在「我 → 对外形象」写一段 ≤ 600 字的「希望别人怎么了解我、希望怎么被聊」
- 后端 `User.public_persona` + `GET/PUT /users/me/persona` + `GET /users/{id}/profile`;`/users` 列表带单行摘要
- 注入化身 prompt:访客模式下它决定化身「怎么呈现」(先聊什么、什么语气、避开什么),人格卡片仍决定「说的是不是真的」;自聊也带上;没有卡片时可以只靠它撑起对话(冷启动)
- 访客打开对方化身时,聊天顶部有「TA 的自我介绍」卡(没聊过默认展开,聊过收起)
- prompt 全部改用无性别的「TA」,不再默认「他」

**前端重做(v3.10 → v4.0,无新增原生依赖,可 OTA)**
- 设计系统 `client/constants/theme.ts`:iOS 分层配色(浅/深)、字阶、圆角、间距、阴影;通用件 `client/components/ui/`
- 导航:标准底部 Tab(日记 / 对话 / 我)替换条纹划动导航(bd4816d5 的实验,需要时 git 历史里有);编辑页统一为模态 + 导航栏「取消 / 保存」
- 日记:按天分组的时间线卡片,长按弹出操作面板(可见性分段、加锁、重新学习、删除),大标题 + 状态胶囊 + 日历筛选
- 对话:我的化身卡(卡片数 + 对外形象状态)、置顶 / 化身 / 名人化身三组;移掉了拖动排序(绝对定位行布局脆弱,只影响本机顺序),置顶保留
- 聊天:新气泡、多行输入条、呼吸点「正在输入」、失败横幅可重试(草稿不丢)
- 新页面:「我」Tab(头像/状态/对外形象/人格卡片/偏好/账号)、人格卡片页(按来源日记分组、置信度条)、账号与安全页(弹层式改名/改密/注销)
- **修复网页版所有确认框失效**:react-native-web 的 `Alert.alert` 是空实现,之前网页上删日记、退出登录、注销都按了没反应;现在统一用自绘弹窗(`lib/dialog.ts`)

**后端修补**
- 化身 LLM 调用失败改回 503(之前伪装成一条「[化身暂时下线]」的化身消息混进聊天,客户端还得靠 id="error" 识别)
- 注册接口加 IP 限流(5 个/小时);`/chat/history` 的 limit 封顶 200;`/users` 的卡片数改为一条 GROUP BY
- `distill.log` 移到数据目录(原来写在代码目录)
- 新增 `server/tests/`(9 个用例,LLM 打桩),`deploy/deploy.sh` 部署前先跑

**部署**
- 新增 GitHub Actions 工作流 `.github/workflows/deploy.yml`(触发:提交信息带 `[deploy]` 的分支 push / `deploy-*` 标签 / 手动);服务器目录不是 git 仓库,工作流对它走 rsync 同步
- 2026-11-03 11:24 UTC 第 2 次运行成功部署提交 `4565a2ec`,公网健康检查通过

**文档**
- `CLAUDE.md` §3 校准到代码现状(访客 / 裁判 / 私信 / 名人化身已存在),§4 补客户端 UI 约定;`AGENTS.md` 与之同步
- `HANDOFF.md` 收进仓库(之前只在本机)
- `.claude/launch.json` 去掉写死的 Windows 用户路径
- 仓库地址修正为 github.com/1elel1/agentdiary

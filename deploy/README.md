# 云端部署(Ubuntu 24.04)

生产后端跑在腾讯云 Ubuntu 上,FastAPI 由 systemd 托管,nginx 反代 80 端口。

| 项 | 值 |
|---|---|
| 公网地址 | `https://43.130.127.226.sslip.io`(80 全部跳转 HTTPS) |
| 健康检查 | `/health` |
| 证书 | Let's Encrypt,ECDSA,`certbot.timer` 自动续期(续期演练已验证) |
| 域名 | sslip.io 免费泛解析:`<IP>.sslip.io` 直接解析到该 IP,无需注册。**服务器 IP 变了域名要跟着变,证书也要重签** |
| 代码目录 | `/home/ubuntu/agentdiary` |
| **数据目录** | `/var/lib/agentdiary`(DB + 头像,**在代码目录之外**) |
| 环境变量 | `/etc/agentdiary.env`(root:root 600,含 API Key,不入库) |
| SSH | `ssh agentdiary`(见本机 `~/.ssh/config`) |

## 本目录文件

- `deploy.sh` → **一键部署**(在服务器上跑):拉代码 → 装依赖并跑测试 → 导出网页版发布 → 重启 API → 健康检查
- `backup-db.sh` → SQLite 热备份(`.backup` 在线快照 + 头像打包,保留 14 天),配 cron 每天跑
- `agentdiary-api.service` → 部署到 `/etc/systemd/system/`
- `nginx-agentdiary.conf` → 部署到 `/etc/nginx/sites-available/agentdiary`,并软链到 `sites-enabled/default`
- `agentdiary.env.example` → 复制到 `/etc/agentdiary.env` 后填入真实 `DASHSCOPE_API_KEY`

## 日常发布

```bash
ssh agentdiary
cd /home/ubuntu/agentdiary && bash deploy/deploy.sh            # 部署 main
cd /home/ubuntu/agentdiary && bash deploy/deploy.sh <branch>   # 部署某个分支(先在分支上验证再合 main)
SKIP_WEB=1 bash deploy/deploy.sh                               # 只更新后端
```

脚本会先跑 `pytest`,测试不过不会重启服务。网页版需要服务器有 node ≥ 20
(`curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs`);
没装的话脚本会跳过网页步骤,改在开发机构建后上传:

```powershell
# Windows 开发机(utils\env.bat 加载过 node 后)
cd client
$env:EXPO_PUBLIC_API_URL="https://43.130.127.226.sslip.io"; npx expo export --platform web
scp -r dist/* agentdiary:/tmp/agentdiary-web/
ssh agentdiary "sudo rsync -a --delete /tmp/agentdiary-web/ /var/www/agentdiary/"
```

本次(2026-11)前端重做没有新增原生依赖,App 端走 EAS Update(OTA)即可:
`cd client && eas update --channel preview --message "v4.0 ui"`;`APP_VERSION`
在 `client/constants/app.ts`,发 OTA 前 +1,真机在「我」页底部看版本号确认。

## 从 GitHub Actions 部署(不用登服务器)

`.github/workflows/deploy.yml`:在 GitHub 的 runner 上跑后端测试、导出网页版,再用 SSH
把代码推进服务器仓库、上传静态站、跑 `deploy/deploy.sh`(NO_GIT=1 SKIP_WEB=1)、最后做公网
健康检查。服务器上不需要 node,也不依赖服务器仓库的 git remote 指向哪里。

**一次性准备**:仓库 Settings → Secrets and variables → Actions → New repository secret,
名字 `DEPLOY_SSH_KEY`,值 = 本机 `~/.ssh/test.pem` 的完整内容(含 BEGIN / END 两行)。
地址和用户名默认 `ubuntu@43.130.127.226`,要改就加仓库变量 `DEPLOY_HOST` / `DEPLOY_USER`。

**触发**:Actions → Deploy to server → Run workflow → 选分支(`skip_web` 勾上只更新后端)。
只手动触发,不绑 push:约定是分支先在服务器上验证、再合 main。

注意:它会把服务器仓库的同名分支**强制指到本次提交**(GitHub 是唯一事实来源);服务器
上有未提交改动时会中止并列出,不会覆盖。

## 数据库备份

```bash
sudo apt-get install -y sqlite3
(crontab -l 2>/dev/null; echo '10 4 * * * /home/ubuntu/agentdiary/deploy/backup-db.sh') | crontab -
ls /var/backups/agentdiary
```

备份只在本机磁盘,记得定期拷一份到别处。

## 常用命令

```bash
sudo systemctl status agentdiary-api
sudo systemctl restart agentdiary-api
sudo journalctl -u agentdiary-api -n 100 --no-pager
```

## 三条不能动的约束

1. **绝不加 `--workers`**。SQLite 写并发、`ratelimit.py` 的进程内计数、
   蒸馏用的 BackgroundTasks,三样都依赖单进程。
2. **uvicorn 只绑 `127.0.0.1`**。公网入口只能是 nginx,8000 不对外。
3. **nginx `client_max_body_size` 不低于 12m**。头像上限 8MB 且走 base64
   传输(膨胀 1.33 倍),默认 1m 会直接 413。

`proxy_read_timeout 300s` 同理:蒸馏和化身对话都是长请求,默认 60s 会截断。

## 网页版(同域名)

`client` 的 Expo 工程导出成静态站,和 API 共用 `43.130.127.226.sslip.io`:

```bash
cd client && npx expo export --platform web      # 产物在 client/dist
# dist/ 内容上传到服务器 /var/www/agentdiary
```

不用装 App,浏览器直接打开就是完整前端(登录、日记、对话、设置都能用),
演示时很方便。连的是同一个后端和同一份数据。

**维护陷阱:nginx 用正则而不是前缀匹配分流接口**

```nginx
location ~ ^/(auth|chat|diaries|dm|health|judge|persona-cards|users|docs|redoc|openapi\.json)(/|$)
```

两个原因:

1. 前缀 `location /chat` 会把网页端的 `/chats` 路由一起吃掉(只差一个字母),
   `(/|$)` 这个边界才挡得住
2. **新增后端路由时必须同步这个正则**,否则请求会落到静态站、返回 index.html
   —— 症状是接口莫名其妙返回一坨 HTML

其余路径走 `try_files $uri $uri.html $uri/ /index.html`:Expo 静态导出把每个
路由生成一个 `.html`,动态路由(`/visit/xxx`)没有对应文件,兜底回 index.html
交给客户端路由。

同机还跑着 `dazi` / `offline-aid` / `travelingmate` 三个站点(各自独立子域名),
改 nginx 时注意不要动到它们。

## 云防火墙

腾讯云轻量应用服务器的防火墙在**实例之外**,虚拟机内的 iptables / ufw 看不到也
改不了。放行清单必须在控制台维护,当前:`22 / 80 / 443 / ICMP`。

排查要点:如果 nginx 在监听但外网连不上,先怀疑这里——服务器本机 curl 能通、
外网不通,基本就是安全组没放行。

## 一个踩过的坑:certbot --redirect

`certbot --nginx --redirect` 自动加的跳转是按 `server_name` 匹配的,**裸 IP 访问
会落不到任何 server 块而返回 404**——症状和「反代挂了」一模一样,极易误判。

它在 443 尚未放行时更致命:HTTP 跳到连不上的 HTTPS,等于整个服务下线。

正确顺序:**先开 443 → 验证 HTTPS 公网可达 → 再加跳转**。现在的配置里跳转目标
写死成域名(不是 `$host`),所以裸 IP 访问也能正确跳到有证书的域名上。

`/.well-known/acme-challenge/` 在 80 上单独放行,否则续期会被跳转挡掉。
续期演练在跳转开启后已验证通过。

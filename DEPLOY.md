# 部署文档

从零开始，在一台干净的 Linux 机器上部署 dsh web（解决方案专家 preset），通过 Nginx 反向代理供浏览器访问。

## 前提

开发机上已打好两个包（文件名带日期，以下为示例）：

| 包 | 内容 | 示例大小 |
| --- | --- | --- |
| `deepseek-harness-src-codex-knowledge-base-management-YYYYMMDD.tar.gz` | 完整源码（含全部改动，已排除 node_modules/.git/lib/dist 及 macOS 元数据），解压后得到 `deepseek-harness/` 目录 | 34M |
| `solution-expert-preset-YYYYMMDD.tar.gz` | 解决方案专家 preset：`preset.yml`、`agent.cordis.yml`、`skills/`（knowledge-extraction / knowledge-merge / previsit-plan）、三个知识库（公共 / 候选 / 方案专属），解压后得到 `solution-expert/` 目录 | 291M |

> 源码包内置了「固定访问 token」改动：设置 `DSH_WEB_LAUNCH_TOKEN` 环境变量后，进程每次重启打印的 URL token 不再变化（详见第 5 节）。

---

## 1. 系统环境准备

### 1.1 安装 Node.js

dsh 要求 Node.js v22.19 或更高。用 nvm 安装 Node 22 LTS：

```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22
nvm use 22
node -v
```

### 1.2 安装 pnpm

```
npm install -g pnpm
pnpm -v
```

### 1.3 安装编译依赖

Ubuntu / Debian：

```
apt update && apt install -y build-essential python3
```

CentOS / OpenCloudOS / RHEL：

```
yum groupinstall -y "Development Tools"
yum install -y python3
```

---

## 2. 部署源码

### 2.1 解压源码

把源码包上传到服务器后解压。包内顶层就是 `deepseek-harness/`，直接解压到 `/opt` 即可得到仓库根 `/opt/deepseek-harness/`：

```
cd /opt
tar xzf /path/to/deepseek-harness-src-*.tar.gz
# 解压后得到仓库根 /opt/deepseek-harness/
cd /opt/deepseek-harness
```

### 2.2 安装依赖

```
pnpm install
```

### 2.3 Build

tar 包里没有 `.git`，需要手动指定 commit hash。把下面的 `c70a0f7` 替换成你自己的 7 位 hash（可用 `git rev-parse --short HEAD` 在开发机查）：

```
export DSH_CLIENT_COMMIT_HASH=c70a0f7
pnpm run build
```

如果 build 报 `git rev-parse HEAD` 错误，就是漏了上面的环境变量。

build 完成后确认入口文件存在：

```
ls apps/cli/lib/bin.js
```

---

## 3. 部署 solution-expert preset

### 3.1 解压 preset

把 preset 包解压到 Harness 用户目录下的 `.agent-presets/`。默认 Harness home 是 `~/.dsh`（可用 `DSH_HOME` 环境变量改，见第 5 节），因此默认放置路径是 `~/.dsh/.agent-presets/solution-expert/`：

```
mkdir -p ~/.dsh
cd ~/.dsh
tar xzf /path/to/solution-expert-preset-*.tar.gz
# 解压后得到 ~/.dsh/.agent-presets/solution-expert/
ls ~/.dsh/.agent-presets/solution-expert/
```

预期看到：

```
agent.cordis.yml        # preset 的 agent 组合配置
preset.yml              # preset 元数据（name: 解决方案专家）
skills/                 # knowledge-extraction / knowledge-merge / previsit-plan
公共知识库/              # 公司与产品、写作规范、政策依据、README.md
候选知识库/              # 待审核 / 已采纳 / 已拒绝
方案专属知识库/          # 行前方案
```

### 3.2 放置位置说明（重要）

- preset 目录**必须**放在 `$DSH_HOME/.agent-presets/` 下（默认 `~/.dsh/.agent-presets/`），dsh 启动时扫描该目录加载用户 preset。
- 源码 `packages/bundle/web-app/cordis.patch.yml` 里的知识库配置已**硬编码**指向 `~/.dsh/.agent-presets/solution-expert/公共知识库`、`候选知识库`、`方案专属知识库` 三个路径。如果部署时用 `DSH_HOME` 改了 home，需要同步修改 `~/.dsh` 为实际路径（即保持 preset 实际落在 `$DSH_HOME/.agent-presets/solution-expert/`）。
- 知识库随 preset 一起部署，无需单独拷贝；运行中写入知识库的变更（如候选知识库的采纳/拒绝）会落在服务器上这个目录里。

---

## 4. 准备工作区目录

agent 的产出文件（Word、方案等）落在工作区目录。新建一个空目录并记下绝对路径（示例用 `/opt/dsh-workspace`）：

```
mkdir -p /opt/dsh-workspace
```

该目录是 systemd 服务的 `WorkingDirectory`，也是文件预览/下载服务的根目录（见第 6 节）。

---

## 5. 配置环境变量

启动 dsh 前需要准备以下环境变量（写入 systemd 服务文件或 `.env`）：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 是 | DeepSeek API key，例如 `sk-xxx` |
| `DSH_CLIENT_COMMIT_HASH` | 是 | build 时用的 7 位 commit hash（构建期需要，运行期非必需） |
| `DSH_PERMISSION_MODE` | 否 | 设为 `danger-full-access` 可跳过默认审批，所有操作直接执行（仅信任环境使用） |
| `DSH_WEB_LAUNCH_TOKEN` | 否 | **固定访问 token**。设置后每次启动 URL 里的 `?token=` 都不变，重启无需换 token；不设置则每次启动随机生成。用飞书登录时不需要它（见第 9 节） |
| `FEISHU_APP_SECRET` | 飞书模式必填 | 飞书自建应用的 App Secret，变量名由 patch 里的 `feishu.appSecretEnv` 指定。只放环境变量，不写进仓库文件（见第 9 节） |
| `DSH_HOME` | 否 | Harness 用户目录，默认 `~/.dsh` |

固定 token 示例：

```
export DSH_WEB_LAUNCH_TOKEN=p6MWVM5b4RvRwCnQyziXAVm7eZBMeVocGTuMk6BrDBI
```

设置后每次启动打印的 URL 都是：

```
dsh web: http://127.0.0.1:3080/?token=p6MWVM5b4RvRwCnQyziXAVm7eZBMeVocGTuMk6BrDBI
```

浏览器用这个 URL 首次访问即可换取登录 cookie（默认 30 天有效，可用 `connection.cookieMaxAgeDays` 配置调整）。

---

## 6. 配置 dsh 服务（systemd）

### 6.1 确认 node 绝对路径

systemd 不加载 nvm，必须用 node 的绝对路径：

```
which node
# 输出类似 /root/.nvm/versions/node/v22.19.0/bin/node
```

### 6.2 创建服务文件

```
sudo tee /etc/systemd/system/dsh-web.service << 'EOF'
[Unit]
Description=DeepSeek Harness Web
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/dsh-workspace
Environment=DSH_CLIENT_COMMIT_HASH=c70a0f7
Environment=DSH_PERMISSION_MODE=danger-full-access
Environment=DEEPSEEK_API_KEY=sk-你的实际API_KEY
Environment=DSH_WEB_LAUNCH_TOKEN=p6MWVM5b4RvRwCnQyziXAVm7eZBMeVocGTuMk6BrDBI
ExecStart=/root/.nvm/versions/node/v22.19.0/bin/node /opt/deepseek-harness/apps/cli/lib/bin.js --profile web --trusted-host 115.159.198.180 --port 3080 --host 127.0.0.1
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

需要替换的值：

| 占位符 | 说明 |
| --- | --- |
| `/root/.nvm/versions/node/v22.19.0/bin/node` | 第 6.1 步 `which node` 的输出 |
| `/opt/deepseek-harness` | 源码仓库根（源码包解压到 `/opt` 后得到的就是这一层） |
| `/opt/dsh-workspace` | 第 4 步创建的工作区目录（agent 产出目录，文件预览/下载的根） |
| `c70a0f7` | 你的源码 commit hash（7 位） |
| `sk-你的实际API_KEY` | DeepSeek API key |
| `115.159.198.180` | 你的服务器公网 IP 或域名（作为 `--trusted-host`，与 Nginx `server_name` 一致） |
| `p6MWVM5b4RvRwCnQyziXAVm7eZBMeVocGTuMk6BrDBI` | 可选；不固定 token 则删掉这一行 `Environment` |

注意：ExecStart 必须用 `node 绝对路径 + apps/cli/lib/bin.js`，不能写 `node_modules/.bin/dsh`——build 产物里没有这个二进制。

### 6.3 启动服务

```
sudo systemctl daemon-reload
sudo systemctl enable dsh-web
sudo systemctl start dsh-web
sudo journalctl -u dsh-web -f
```

启动后日志里应该看到类似：

```
dsh web: http://127.0.0.1:3080/?token=xxx (LAN: http://192.168.x.x:3080/?token=xxx)
```

如果日志里出现 `workspace-files: failed to import`，说明改了源码后没重新 build，回到第 2.3 步重新 build。

---

## 7. Nginx 反向代理

### 7.1 安装 Nginx

Ubuntu / Debian：

```
apt update && apt install -y nginx
```

CentOS / OpenCloudOS / RHEL：

```
yum install -y nginx
```

### 7.2 创建站点配置

```
sudo tee /etc/nginx/conf.d/dsh-web.conf << 'EOF'
server {
  listen 80;
  server_name 115.159.198.180;

  client_max_body_size 100M;

  location / {
      proxy_pass http://127.0.0.1:3080;
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_read_timeout 86400;
      proxy_send_timeout 86400;
  }
}
EOF
```

把 `server_name` 改成你的 IP 或域名。

> 飞书登录现在 http 也能跑：cookie 只在 `https` 时带 `Secure`，http 下正常写入。但 OAuth 的 `code` 和登录 cookie 在 http 上是明文传输，生产环境建议加 HTTPS。

### 7.3 测试并重载

```
sudo nginx -t
sudo nginx -s reload
```

### 7.4 如果用宝塔面板

1. 软件商店 → 安装 Nginx（如已装可跳过）
2. 网站 → 添加站点 → 输入你的 IP 或域名，不设置数据库
3. 站点设置 → 反向代理 → 添加反向代理：
   - 代理名称：`dsh-web`
   - 目标 URL：`http://127.0.0.1:3080`
   - 发送域名：`$host`
4. 保存后宝塔会自动生成 Nginx 配置

---

## 8. 验证部署

### 8.1 首次登录

浏览器打开（token 见启动日志，固定 token 则长期不变）：

```
http://你的IP或域名/?token=xxx
```

首次访问会 303 重定向到干净的根路径并写入登录 cookie；之后直接访问 `http://你的IP或域名/` 即可（cookie 默认 30 天有效）。

### 8.2 检查清单

1. 能看到 dsh web 界面
2. 左侧预设选择里能看到「解决方案专家」（来自 `preset.yml` 的 `name`）
3. 知识库区域能看到三个知识库：公共知识库 / 候选知识库 / 方案专属知识库（路径来自 web-app 的 knowledge-base 配置）
4. 开一个会话，确认 agent 能读取公共知识库素材并生成方案
5. 让 agent 生成一个 Word 文件，点击产出文件，右侧预览 → header 右上角有下载图标 → 点击能下载
6. 重启服务（`systemctl restart dsh-web`），再次打开根路径：设置过 `DSH_WEB_LAUNCH_TOKEN` 时 URL 不变、无需重新登录

以上是固定 token 模式的检查项；飞书登录模式的检查项见第 9.6 节。

---

## 9. 飞书企业登录模式（多用户）

第 5～8 节是「固定 token」的单人模式：谁拿到 URL 谁就能进。企业里多人使用时改用飞书登录，身份由飞书 OAuth 给出，每人一个固定工作区，只看得到自己的会话。

### 9.1 两种模式对照

| 模式 | 认证方式 | 适用场景 |
| --- | --- | --- |
| 固定 token | `?token=xxx` 换取 cookie | 单机、单人、内网演示 |
| 飞书登录 | 飞书 OAuth 回调写入 cookie | 企业多人，无需分发 token |

飞书模式下 `DSH_WEB_LAUNCH_TOKEN` 不再需要。

### 9.2 飞书侧配置（open.feishu.cn 开发者后台）

1. **创建应用**：开发者后台 → 创建企业自建应用，记下 App ID（`cli_xxx`）和 App Secret。
2. **安全设置 → 重定向 URL**：填 `<publicOrigin>/auth/feishu/callback`。必须与 patch 里 `publicOrigin` 完全一致（协议、域名、端口、路径都要逐字符对齐），不一致时飞书会直接报 redirect_uri 错误。飞书允许 `http://`（含 IP + 端口）作为回调地址，生产建议用 https。
3. **权限管理**：`authen/v1/user_info` 的基础字段（`open_id`、`name`、`tenant_key`）不需要额外权限，登录即可拿到；需要邮箱、手机号时再另行申请。
4. **可用范围**：把要使用的人或部门加进去，不在范围内的人点授权会被拒绝。
5. **版本管理与发布**：创建版本 → 申请发布 → 企业管理员审核通过。这一步最容易被漏，未发布时前面配的可用范围和重定向 URL 都不会生效。
6. **可选「网页应用」**：添加网页应用能力，桌面端主页填 `https://<你的域名>/`，这样在飞书客户端内打开时可以免确认直接跳转。

### 9.3 服务端配置

App Secret 只放环境变量，不进仓库：

```
install -m 600 /dev/null ~/.dsh/feishu.env
printf 'export FEISHU_APP_SECRET=<App Secret>\n' > ~/.dsh/feishu.env
```

patch 文件（可放仓库根目录，示例 `./feishu.patch.yml`；仓库里已有一份开发用样例，指向 `http://127.0.0.1:3080`，生产按下面的模板改）：

```
- id: connection
  config:
    trustedHosts: ["dsh.example.com"]
    feishu:
      publicOrigin: https://dsh.example.com
      appId: cli_xxxxxxxxxxxx
      appSecretEnv: FEISHU_APP_SECRET
      workspaceRoot: /opt/dsh-users
      tenantKeys: ["<企业 tenant_key>"]
```

要点：

- patch 的 `config` 是**整体替换**，不是深合并：`trustedHosts` 必须把这些值重新列全。
- `appSecretEnv` 填的是**环境变量名**，不是密钥本身。
- `publicOrigin` 必须是规范化 origin（`http(s)://host[:port]`，不带路径、末尾斜杠或账号密码），其 host:port 还必须在 `trustedHosts` 里。
- `tenantKeys` 留空数组表示不限企业（仅开发用）；生产环境写死本企业的 `tenant_key`，避免外部企业账号登录。
- `--patch` 覆盖层里不要用 `!!js` 表达式（只在 bundle 层生效），这些值直接写字面量。

### 9.4 启动（systemd 改造）

在第 6.2 节的服务文件上改两处：加一个 `Environment`，`ExecStart` 追加 `--patch`。

```
[Service]
...
Environment=FEISHU_APP_SECRET=cli_xxxxxxxxxxxx_secret
EnvironmentFile=-/root/.dsh/feishu.env
ExecStart=/root/.nvm/versions/node/v22.19.0/bin/node /opt/deepseek-harness/apps/cli/lib/bin.js \
  --profile web --patch /opt/deepseek-harness/feishu.patch.yml \
  --port 3080 --host 127.0.0.1
```

也可以把 `Environment=FEISHU_APP_SECRET=...` 换成 `EnvironmentFile=-/root/.dsh/feishu.env`，任选其一，别重复写。

启动后日志里只打印：

```
dsh web: http://127.0.0.1:3080
```

没有 `?token=`，说明免登入口生效。如果出现 `entries did not activate` 并带 `connection`，看 9.7 的报错对照。

### 9.5 登录流程与行为

1. 浏览器访问 `https://<域名>/`，未登录时 303 到 `/auth/login`；
2. 点「使用飞书登录」→ `/auth/feishu` → 303 跳 `https://accounts.feishu.cn/open-apis/authen/v1/authorize`，带 `state` 和一次性 `dsh-oauth` cookie；
3. 飞书回调 `/auth/feishu/callback` 换取 token 并调用 `authen/v1/user_info`，写入 `dsh-user` cookie（HttpOnly、SameSite=Lax、默认 30 天），再 303 回 `/`；
4. 每人固定工作区：首次登录自动创建 `<workspaceRoot>/<userId>`，标题为「<飞书姓名>的工作空间」，之后固定不变；界面不提供新建、改名、删除工作区；
5. 会话隔离：只列自己的会话，用别人的 `sessionId` 访问一律 404；
6. 知识库：公共 / 方案专属 / 候选三个部署级知识库全员共享；「项目知识库」只列当前账号自己的工作区，看不到别人的目录；
7. 侧边栏左下角显示「飞书姓名」，点开是「设置 / 登出」菜单：设置打开既有的设置面板，登出即 `POST /auth/logout`，会删掉该浏览器会话的 cookie 并断开它的 WebSocket。
8. 管理员账号：本部署**第一个**登录成功的账号自动成为管理员（`web_accounts.json` 的 `users.<id>.admin` 记为 `true`），之后的账号都是普通员工。设置面板里「Models」「Plugins」两个分区只对管理员注册，员工看不到；这两个分区管的是全员共用的模型、密钥和插件开关，因此不逐个方法做服务端权限校验，只靠界面不注册 + 内部部署的信任边界。

   手工调整（改完需重启实例生效）：

   ```
   # 把某个账号设为管理员（值为 true），取消则改回 false
   node -e 'const fs=require("fs"),p=process.env.HOME+"/.dsh/storages/web_accounts.json",d=JSON.parse(fs.readFileSync(p));for(const u of Object.values(d.tables.users))if(u.displayName==="张三")u.admin=true;fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n")'
   ```


### 9.6 验证

```
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://dsh.example.com/
# 303 https://dsh.example.com/auth/login

curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://dsh.example.com/auth/feishu
# 303 https://accounts.feishu.cn/open-apis/authen/v1/authorize?client_id=...&redirect_uri=...&state=...
```

再用浏览器完整走一遍登录：能看到「你的飞书姓名的工作空间」；换一个账号登录，看不到前一个账号的会话。

### 9.7 零点击免登（可选）

当前未登录时先停在 `/auth/login` 的按钮页。若要求飞书客户端内点开即进，可把未登录的 303 目标直接改成 `/auth/feishu`（改 `packages/client/connection/src/accounts.ts` 的 `authorizeIndex`）。代价是浏览器直连时也会直接跳授权页，没有落地说明页。

---

## 10. 日常运维

### 更新代码

上传新的源码包后执行：

```
cd /opt/deepseek-harness
tar xzf new-src.tgz
pnpm run clean            # 关键：删除旧 lib/ 与 *.tsbuildinfo
pnpm install
export DSH_CLIENT_COMMIT_HASH=新的hash
pnpm run build
systemctl restart dsh-web
```

**为什么必须 `pnpm run clean`**：`build:lib` 用的是 `tsc -b` 增量构建，依赖仓库根目录的 `tsconfig.host.tsbuildinfo` / `tsconfig.client.tsbuildinfo`。源码包里不含 `lib/`，但服务器上旧的 `lib/` 和 tsbuildinfo 会保留；tar 解压出的源码 mtime 往往不比旧产物新，tsc 就判定“没有变化”而跳过编译。表现就是：**新增的插件（没有旧产物）被真正构建了，其他既有包仍是旧逻辑**。`clean` 会删掉所有 `lib/`、`*.tsbuildinfo` 和孤儿目录，强制全量重建。

如果 `clean` 后仍然异常，说明源码目录里还残留了旧版本已删除的源文件（tar 只覆盖不删除）。最干净的做法是整目录替换：

```
mv /opt/deepseek-harness /opt/deepseek-harness.old
cd /opt
tar xzf new-src.tgz
cd /opt/deepseek-harness
pnpm install
export DSH_CLIENT_COMMIT_HASH=新的hash
pnpm run build
systemctl restart dsh-web
```

如果服务端产物确认是新的（`apps/cli/lib/bin.js` 与 `packages/**/lib` 时间戳都是刚构建的），但运行行为仍是旧的，检查 profile 的模块缓存，删掉后让启动时重建：

```
rm -rf /root/.dsh/profiles/web/.dsh-module-fallback
systemctl restart dsh-web
```

构建完成后确认产物确实是新的：

```
ls -l apps/cli/lib/bin.js
find packages -path '*/lib/*' -name '*.js' -newermt '-30 minutes' | wc -l
```

浏览器端加载的是 `apps/web/dist` 与各插件的 client bundle，重启后如果界面仍显示旧行为，强制刷新浏览器缓存（`Cmd+Shift+R` / `Ctrl+Shift+R`）。

### 更新 preset / 知识库

上传新的 preset 包后执行：

```
cd ~/.dsh
tar xzf new-solution-expert-preset.tgz
systemctl restart dsh-web
```

> 注意：若知识库已被业务使用（候选知识库有"待审核/已采纳"等状态），解压新包前先备份：`cp -r ~/.dsh/.agent-presets/solution-expert ~/.dsh/.agent-presets/solution-expert.bak`，避免覆盖运行时写入的数据。

### 备份（飞书模式）

```
cp ~/.dsh/storages/web_accounts.json /backup/web_accounts-$(date +%F).json
tar czf /backup/dsh-users-$(date +%F).tgz -C /opt dsh-users
```

`web_accounts.json` 里是 `users`（账号）、`web_sessions`（浏览器登录）、`session_owners`（会话归属）三张表；`workspaceRoot`（如 `/opt/dsh-users`）下是每个人的工作目录。要收回某人的访问，删掉 `users` 里对应的账号行即可，残留的登录和归属记录会在下次启动时自动清理。

### 查看日志

实时日志：

```
journalctl -u dsh-web -f
```

最近 100 行：

```
journalctl -u dsh-web -n 100
```

### 重启 / 停止

```
systemctl restart dsh-web
systemctl stop dsh-web
systemctl status dsh-web
```

### Nginx 配置修改后

```
nginx -t && nginx -s reload
```

---

## 常见问题

| 问题 | 原因 | 解决 |
| --- | --- | --- |
| build 报 `git rev-parse HEAD` 失败 | tar 包的 `.git` 不可用 | 设置 `DSH_CLIENT_COMMIT_HASH` 环境变量 |
| systemd 报 `203/EXEC` | ExecStart 指向的二进制不存在 | 用 `node 绝对路径 + apps/cli/lib/bin.js`，不能写 `.bin/dsh` |
| `workspace-files: failed to import` | 改了源码没重新 build | `pnpm run build` 后重启 |
| 打开页面 404 或连接拒绝 | dsh 没启动或端口不对 | `systemctl status dsh-web` 看日志 |
| 设置页报 "settings are unavailable in this browser" | 非 loopback 访问的设计行为 | 正常，API key 用环境变量配置 |
| 所有操作都弹审批 | 默认权限模式 | 设 `DSH_PERMISSION_MODE=danger-full-access` |
| 文件预览显示 "文件资源服务不可用" | `WorkingDirectory` 不对 | 改成工作区目录（如 `/opt/dsh-workspace`） |
| 文件下载 404 或 403 | 路径在 workspace 外 | `WorkingDirectory` 必须是工作区目录 |
| 重启后 token 变了、旧 URL 打不开 | 未设置固定 token | 设 `DSH_WEB_LAUNCH_TOKEN`（或直接访问根路径，cookie 仍在则无需 token） |
| 换浏览器 / 换端口后要求重新登录 | cookie 绑定 host:port | 重新用带 token 的 URL 访问一次即可 |
| 知识库为空 / 加载不到 | preset 没放到 `~/.dsh/.agent-presets/solution-expert/` | 确认第 3 节路径，重启服务 |
| 左侧没有「解决方案专家」预设 | preset 目录缺失或 `preset.yml` 损坏 | 检查 `~/.dsh/.agent-presets/solution-expert/preset.yml` |
| Nginx 报 "bind () to 0.0.0.0:80 failed" | 80 端口被占用 | `ss -tlnp \| grep :80` 查占用进程 |
| WebSocket 连接失败 | Nginx 没配 Upgrade/Connection | 确认有 `proxy_set_header Upgrade $http_upgrade` |
| 启动报 `missing Feishu secret environment variable <名字>` | `appSecretEnv` 填成了 App Secret 本身 | 改成环境变量名，并确认该变量已 `export` 或写进 systemd |
| 启动报 `feishu.publicOrigin host "..." is not in trustedHosts` | patch 的 `trustedHosts` 没包含公网 host:port | 把 `publicOrigin` 的 host:port 加进 `trustedHosts`（注意 patch 是整体替换） |
| 启动报 `publicOrigin must be a canonical origin` | URL 带路径、末尾斜杠，或含用户名密码 | 只写 `http(s)://host[:port]`，不带路径和末尾 `/` |
| 飞书授权页报 redirect_uri 不匹配（如 20029） | 后台重定向 URL 与 `publicOrigin` 不一致 | 两处逐字符对齐，路径固定 `/auth/feishu/callback` |
| 授权后 403「当前企业无权访问」 | `tenantKeys` 不含该账号所属企业 | 填正确的 `tenant_key`，或开发期先留空数组 |
| 登录成功后刷新又要求登录 | Nginx 改了 Host 头，或 cookie 的 domain 与实际访问地址不一致 | 保留 `proxy_set_header Host $host`；http 模式下 cookie 不带 Secure，可正常落 |
| 启动报 `Session ownership references a missing account` | 手动删过账号，残留登录/归属记录（旧版本代码） | 当前版本启动时会自动清理并打 warn；旧包需清 `~/.dsh/storages/web_accounts.json` 里对应行 |
| 飞书模式下左侧「我的审核」「知识库」不见了 | 客户端插件被个人模式开关挡住 | 用当前源码构建（含 `ui-knowledge-base` 修复），并重启服务 |
| 设置面板里没有「Models」「Plugins」 | 当前账号不是管理员（这两个分区只给管理员注册） | 把该账号的 `users.<id>.admin` 改成 `true` 后重启，参考 9.5 第 8 条 |
| 更新后新插件生效，其他功能仍是旧逻辑 | 旧 `lib/` 与 `*.tsbuildinfo` 残留，`tsc -b` 增量构建跳过既有包 | `pnpm run clean` → `pnpm install` → `pnpm run build` → 重启 |
| 重启后界面仍显示旧版本 | 浏览器缓存了旧 `client.js` / `dist` | 强制刷新（`Cmd+Shift+R` / `Ctrl+Shift+R`） |

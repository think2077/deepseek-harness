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

把源码包上传到服务器后解压：

```
mkdir -p /opt/deepseek-harness
cd /opt/deepseek-harness
tar xzf /path/to/deepseek-harness-src-*.tar.gz
# 解压后当前目录下出现 deepseek-harness/
cd deepseek-harness
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
| `DSH_WEB_LAUNCH_TOKEN` | 否 | **固定访问 token**。设置后每次启动 URL 里的 `?token=` 都不变，重启无需换 token；不设置则每次启动随机生成 |
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
ExecStart=/root/.nvm/versions/node/v22.19.0/bin/node /opt/deepseek-harness/deepseek-harness/apps/cli/lib/bin.js --profile web --trusted-host 115.159.198.180 --port 3080 --host 127.0.0.1
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
| `/opt/deepseek-harness/deepseek-harness` | 源码解压后的实际路径（`/opt/deepseek-harness` + 解压出的 `deepseek-harness/` 子目录） |
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

---

## 9. 日常运维

### 更新代码

上传新的源码包后执行：

```
cd /opt/deepseek-harness/deepseek-harness
tar xzf new-src.tgz
pnpm install
export DSH_CLIENT_COMMIT_HASH=新的hash
pnpm run build
systemctl restart dsh-web
```

### 更新 preset / 知识库

上传新的 preset 包后执行：

```
cd ~/.dsh
tar xzf new-solution-expert-preset.tgz
systemctl restart dsh-web
```

> 注意：若知识库已被业务使用（候选知识库有"待审核/已采纳"等状态），解压新包前先备份：`cp -r ~/.dsh/.agent-presets/solution-expert ~/.dsh/.agent-presets/solution-expert.bak`，避免覆盖运行时写入的数据。

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

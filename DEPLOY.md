# 部署文档

从零开始，在一台干净的 Linux 机器上部署 dsh web，通过 Nginx 反向代理供浏览器访问。

## 前提

你已经在开发机上打好了以下三个包：



| 包                          | 内容                                       | 示例大小   |
| -------------------------- | ---------------------------------------- | ------ |
| `deepseek-harness-src.tgz` | 完整源码（含所有改动，排除 node_modules/lib/dist） | 24M |
| `dsh-userdata.tgz` | 用户配置（preset、credentials、settings） | 13K |
| `dsh-workspace.tgz` | 项目文件（知识库、模板） | 588M |



***

## 1. 系统环境准备

### 1.1 安装 Node.js

dsh 要求 Node.js v22.19 或更高。用 nvm 安装 Node 22 LTS：



```
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

source \~/.bashrc

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



***

## 2. 部署源码

### 2.1 解压源码

把源码包上传到服务器后解压：



```
mkdir -p /opt/deepseek-harness

cd /opt/deepseek-harness

tar xzf /path/to/deepseek-harness-src.tgz
```

### 2.2 安装依赖



```
cd /opt/deepseek-harness

pnpm install
```

### 2.3 Build

tar 包里没有 `.git`，需要手动指定 commit hash。把下面的 `c70a0f7` 替换成你自己的 7 位 hash：



```
export DSH_CLIENT_COMMIT_HASH=c70a0f7

pnpm run build
```

如果 build 报 `git rev-parse HEAD` 错误，就是漏了上面的环境变量。

build 完成后确认入口文件存在：



```
ls apps/cli/lib/bin.js
```



***

## 3. 部署用户数据

把用户数据包解压到 `~/.dsh/`，包含 preset、凭据、设置、知识库、模板等：



```
mkdir -p \~/.dsh

| `dsh-userdata.tgz` | 用户配置（preset、credentials、settings） | 13K |
| `dsh-workspace.tgz` | 项目文件（知识库、模板） | 588M |

ls \~/.dsh/
```

确认目录下有 `.agent-presets/`、`.credentials.yaml`、`settings.yaml` 等。

### 3.2 部署项目文件（知识库、模板）

项目文件包 `dsh-workspace.tgz` 包含知识库、模板等业务文件，解压到 `/opt/` 下：

```
cd /opt
tar xzf /opt/dsh-workspace.tgz
ls /opt/行前方案/
```

确认目录下有 `知识库/`、`模板/` 等。

> 注意：知识库、模板等文件不是放在 `~/.dsh/` 下，而是解压到 `/opt/行前方案/`。这个目录就是 agent 的工作区，后续 systemd 的 WorkingDirectory 要指向它。



***

## 4. 配置 dsh 服务（systemd）

### 4.1 确认 node 绝对路径

systemd 不加载 nvm，必须用 node 的绝对路径：



```
which node

\# 输出类似 /root/.nvm/versions/node/v22.19.0/bin/node
```

### 4.2 创建服务文件



```
sudo tee /etc/systemd/system/dsh-web.service << 'EOF'

[Unit]

Description=DeepSeek Harness Web

After=network.target

[Service]

Type=simple

User=root

WorkingDirectory=/opt/行前方案

Environment=DSH_CLIENT_COMMIT_HASH=c70a0f7

Environment=DSH_PERMISSION_MODE=danger-full-access

Environment=DEEPSEEK_API_KEY=sk-你的实际API_KEY

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



| 占位符                                          | 说明                       |
| -------------------------------------------- | ------------------------ |
| `/root/.nvm/versions/node/v22.19.0/bin/node` | 第 4.1 步 `which node` 的输出 |
| `c70a0f7`                                    | 你的源码 commit hash（7 位）    |
| `sk-你的实际API_KEY`                             | DeepSeek API key         |
| `115.159.198.180`                            | 你的服务器公网 IP 或域名           |
| `/opt/行前方案`                                  | 你的项目文件目录（agent 工作区）      |

注意：ExecStart 必须用 `node 绝对路径 + apps/cli/lib/bin.js`，不能写 `node_modules/.bin/dsh`——build 产物里没有这个二进制。

### 4.3 启动服务



```
sudo systemctl daemon-reload

sudo systemctl enable dsh-web

sudo systemctl start dsh-web

sudo journalctl -u dsh-web -f
```

启动后日志里应该看到类似：



```
dsh web: http://127.0.0.1:3080/?token=xxx
```

如果日志里出现 `workspace-files: failed to import`，说明改了源码后没重新 build，回到第 2.3 步重新 build。



***

## 5. Nginx 反向代理

### 5.1 安装 Nginx

Ubuntu / Debian：



```
apt update && apt install -y nginx
```

CentOS / OpenCloudOS / RHEL：



```
yum install -y nginx
```

### 5.2 创建站点配置



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

### 5.3 测试并重载



```
sudo nginx -t

sudo nginx -s reload
```

### 5.4 如果用宝塔面板



1. 软件商店 → 安装 Nginx（如已装可跳过）

2. 网站 → 添加站点 → 输入你的 IP 或域名，不设置数据库

3. 站点设置 → 反向代理 → 添加反向代理：

* 代理名称：`dsh-web`

* 目标 URL：`http://127.0.0.1:3080`

* 发送域名：`$host`

1. 保存后宝塔会自动生成 Nginx 配置



***

## 6. 验证部署

浏览器打开 `http://你的IP或域名`：



1. 能看到 dsh web 界面，标签页标题显示 "教育共享协同平台"

2. 侧边栏左上角显示 "教育共享协同平台"，不弹内测声明

3. 左侧能看到你的自定义 preset（如 "解决方案专家"）

4. 开一个会话，让 agent 生成一个 Word 文件

5. 点击产出文件，右侧预览 → header 右上角有下载图标 → 点击能下载



***

## 7. 日常运维

### 更新代码

上传新的源码包后执行：



```
cd /opt/deepseek-harness

tar xzf new-src.tgz

pnpm install

export DSH_CLIENT_COMMIT_HASH=新的hash

pnpm run build

systemctl restart dsh-web
```

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



***

## 常见问题



| 问题                                              | 原因                          | 解决                                                 |
| ----------------------------------------------- | --------------------------- | -------------------------------------------------- |
| build 报 `git rev-parse HEAD` 失败                 | tar 包的 `.git` 不可用           | 设置 `DSH_CLIENT_COMMIT_HASH` 环境变量                   |
| systemd 报 `203/EXEC`                            | ExecStart 指向的二进制不存在         | 用 `node 绝对路径 + apps/cli/lib/bin.js`，不能写 `.bin/dsh` |
| `workspace-files: failed to import`             | 改了源码没重新 build               | `pnpm run build` 后重启                               |
| 打开页面 404 或连接拒绝                                  | dsh 没启动或端口不对                | `systemctl status dsh-web` 看日志                     |
| 设置页报 "settings are unavailable in this browser" | 非 loopback 访问的设计行为          | 正常，API key 用环境变量配置                                 |
| 所有操作都弹审批                                        | 默认权限模式                      | 设 `DSH_PERMISSION_MODE=danger-full-access`         |
| 文件预览显示 "文件资源服务不可用"                              | WorkingDirectory 不对         | 改成项目文件目录（如 `/opt/行前方案`）                            |
| 文件下载 404 或 403                                  | 路径在 workspace 外             | WorkingDirectory 必须是项目文件目录                         |
| 每次刷新都弹内测声明                                      | 远程浏览器 settings 走 memory 模式  | 改 `welcome-store.ts` 默认 `localAcknowledged = true` |
| Nginx 报 "bind () to 0.0.0.0:80 failed"          | 80 端口被占用                    | `ss -tlnp \| grep :80` 查占用进程                       |
| WebSocket 连接失败                                  | Nginx 没配 Upgrade/Connection | 确认有 `proxy_set_header Upgrade $http_upgrade`       |
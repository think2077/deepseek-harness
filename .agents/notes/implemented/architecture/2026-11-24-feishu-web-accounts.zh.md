# Agent Note: 单个 Web Harness 中的飞书账号

Status: implemented

[English](2026-11-24-feishu-web-accounts.md) | 中文

## Problem

共享 Web 部署需要用户专属 Session 和固定个人 Workspace，同时不为每个用户创建独立 Harness 进程或数据库。本地启动令牌 Cookie 表示使用实例的权限，不标识个人账号。

## Decision

Connection 的可选飞书提供方负责浏览器登录、异步请求身份和带版本的 JSON 账号 domain。Session 归属独立于 Session JSONL 和 Workspace 成员关系，因此隐藏或归档 Session 不会转移归属。浏览器创建在发布 Session 前预留归属；失败的创建保留不可见的同用户预留。后台子 Session 继承持久父 Session 的归属，API 调用者不能认领没有归属的历史 Session。

公开 origin 是显式部署配置。可选企业白名单限制已通过应用授权的用户；省略或留空时不额外限制企业。OAuth state 短时有效、仅使用一次并绑定浏览器；应用密钥留在服务端环境中。浏览器凭据是随机不透明令牌，仅保存摘要。退出撤销持久记录并关闭其 socket，不取消 Agent。HTTP 分派和每次 WebSocket 迭代器操作携带独立请求身份；事件分发捕获接收账号，不读取碰巧触发事件的请求身份。

每个账号在配置的 Workspace 根目录下拥有一个目录。API 命令固定使用此 Workspace 并拒绝管理变更；Client 移除对应入口。设置、凭据管理、知识库管理和预设编写由部署方维护。浏览器偏好使用带账号前缀的键。账号信息不进入模型输入：用户身份是访问元数据，不是提示词内容。

此决策针对显式飞书部署，部分替代[浏览器令牌认证](2026-08-24-browser-token-authentication.zh.md)中对退出和 TLS 代理的延后决定。该记录仍约束本地启动令牌模式，[浏览器请求信任](2026-07-28-api-browser-trust-boundary.zh.md)仍约束 Host/Origin 校验。两份记录均未被完全替代，也不归档。

## Alternatives considered

为每个用户提供独立 Harness 进程或容器能加强执行隔离，但会引入请求之外的运行时分配器。共享匿名 Cookie 加 Client 列表过滤无法建立持久归属，也不能保护被猜中的 Session ID。将归属加入 Session header 会把账号上线与已发布日志代际耦合；账号 domain 将此关系保留在对话格式之外。仅用 Workspace 成员关系也不能承担授权，因为归档和分组操作独立改变它。

## Consequences

部署使用一个现有 JSON 后端，保留现有 Session 日志和附件。单文件重写适合小规模单进程部署；账号或 Session 数量增加后，可将同一 domain 路由到其他后端。不迁移旧数据，也不隐式归属给首个用户。

此模式隔离应用数据交付，不隔离操作系统执行。Shell 命令和工具共享 Host 身份，可以访问个人目录之外的路径；部署方选择允许登录的人员时必须明确考虑这一点。文件系统和进程隔离不在此部署的保证范围内。

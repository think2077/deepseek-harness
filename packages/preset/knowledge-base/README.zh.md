---
description: "Host 端知识文件服务：管理已配置的共享根目录，并只读展示已注册 Workspace 下的知识目录。"
kind: "package-reference"
---

# @deepseek-ai/dsh-knowledge-base

[English](README.md) | 中文

## 概述

`dsh-knowledge-base` 通过 `knowledgeBase` Remote namespace 暴露文本知识文件。部署配置的根目录可表示公共知识库、方案专属知识库与候选知识，并可设为可写。每个已注册 Workspace 都会把配置的项目知识子目录贡献为只读根目录。磁盘文件始终是权威数据源，更新与移除都携带浏览器打开文件时的 revision，避免过期视图无提示覆盖或移除更新后的文件。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

配置可编辑根目录，以及项目知识使用的相对目录。根目录 id 只能包含小写字母、数字和连字符；以 `project-` 开头的 id 保留给从 Workspace 派生的根目录。

```yaml
- id: knowledge-base
  name: '@deepseek-ai/dsh-knowledge-base'
  config:
    projectKnowledgeDirectory: 知识库
    roots:
      - id: public
        label: 公共知识库
        path: ~/.dsh/.agent-presets/solution-expert/公共知识库
        kind: public
        writable: true
      - id: solution
        label: 方案专属知识库
        path: ~/.dsh/.agent-presets/solution-expert/方案专属知识库
        kind: solution
        writable: true
      - id: candidate
        label: 候选知识库
        path: ~/.dsh/.agent-presets/solution-expert/候选知识库
        kind: candidate
        writable: false
```

服务递归发现 `.md`、`.markdown`、`.yml`、`.yaml` 与 `.json` 文件。随附 Web 组合会展示候选知识，但将其配置为只读，因为候选审核不属于本期范围。不存在的已配置目录显示为空根目录。权限等其他文件系统错误会让目录读取失败，避免错误部署伪装成空库。

### Remote 操作

`list()` 返回根目录与条目元数据，但不暴露 Host 路径。`read(id)` 返回一份文档及其 SHA-256 revision。`create({ rootId, path, content })` 在可写且非项目型的根目录下排他创建新的受支持文本文件。`update({ id, revision, content })` 比较所带 revision 与当前文件，并在一致时原子替换文件。`deleteEntry({ id, revision })` 采用相同校验，再把文件移入根目录下隐藏的 `.knowledge-base-trash`。目标已存在返回 `knowledge-base/already-exists`，revision 不一致返回 `knowledge-base/conflict`，修改项目知识返回 `knowledge-base/read-only`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

已配置路径在 Host 上展开 `~`。每次请求都会从实时 Workspace 注册表重新计算项目根目录，使用 `project-<workspaceId>` 身份，并且永远不继承写权限。目录扫描忽略点号条目、符号链接与不支持的文件。读取会通过 `realpath` 解析根目录和目标，再校验规范目标仍位于规范根目录下。

SHA-256 摘要是内容 revision，不是持久数据库版本。DSH 写入方会取得每个目标的文件锁；`writeFileAtomic` 在接受更新后替换文件并保留其 mode，创建则使用排他文件创建。移除通过把已接受目标重命名到隐藏回收目录实现，因此可以恢复，而不是直接 unlink。浏览器永远不会收到绝对根路径。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | Host 服务、根目录发现、路径约束，以及带 revision 的创建、更新与移除 |
| [`src/types.ts`](src/types.ts) | 浏览器安全的 Remote 值与知识库错误详情 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Workspace 包](../../workspace/workspace/README.zh.md)——贡献项目目录的注册表。
- [Typert protocol](../../typert/protocol/README.zh.md)——该服务使用的类型化 Remote 传输。
- [知识库管理 Agent Note](../../../.agents/notes/implemented/feature/2026-09-26-knowledge-base-management.zh.md)——所有权与并发决策。

-----

<a id="model-experience"></a>
## 模型体验

无。该包暴露 Host 管理 API，不会把知识加入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

以下限制界定第一期管理范围。

- **不能重命名或移动条目**：已支持创建、编辑和可恢复移除，但本期不支持变更路径。
- **回收恢复依赖人工**：被移除的文件保留在 `.knowledge-base-trash` 下；API 暂不列出或恢复它们。
- **目录按需读取**：外部编辑会在重新加载后出现；本包不监听根目录，也不推送失效事件。
- **revision 校验无法锁住外部编辑器**：它能阻止基于已过期 revision 的保存，但非 DSH 进程仍可能在最终比较与原子替换之间写入。
- **不展示二进制项目证据**：PDF、Office 文件、图片与任意文本扩展名仍留在 Workspace，但不属于本期文本编辑器范围。
- **没有自动萃取与候选审核**：本期不会在会话完成时创建知识候选。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。服务直接从已配置根目录与 Workspace 注册表派生每次响应，不拥有可能与二者发生一致性分歧的独立持久索引。

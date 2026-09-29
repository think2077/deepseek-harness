---
description: "Host 端知识文件服务：管理已配置的共享根目录，并只读展示已注册 Workspace 下的知识目录。"
kind: "package-reference"
---

# @deepseek-ai/dsh-knowledge-base

[English](README.md) | 中文

## 概述

`dsh-knowledge-base` 通过 `knowledgeBase` Remote namespace 暴露文本知识文件与候选审核操作。部署配置的根目录可表示公共知识库、方案专属知识库与候选知识。每个已注册 Workspace 都会把配置的项目知识子目录贡献为只读根目录。磁盘文件始终是权威数据源，每次更新、移除与审核流转都携带浏览器打开内容时的 revision，避免过期视图无提示覆盖更新后的内容。

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
    review:
      candidateRootId: candidate
      pendingDirectory: 待审核
      acceptedDirectory: 已采纳
      rejectedDirectory: 已拒绝
      ignoredFiles: [候选知识卡模板.yml]
      mergeProvider: spawn
      mergeSkill: knowledge-merge
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

服务递归发现 `.md`、`.markdown`、`.yml`、`.yaml` 与 `.json` 文件。通用文件操作仍把候选根目录设为只读，而审核配置只允许候选流程编辑待审核卡片，并在配置的三个目录之间移动卡片。`ignoredFiles` 让模板和其他非候选 YAML 不进入审核队列。不存在的已配置目录显示为空根目录。权限等其他文件系统错误会让目录读取失败，避免错误部署伪装成空库。

### Remote 操作

`list()` 返回根目录与条目元数据，但不暴露 Host 路径。`read(id)` 返回一份文档及其 SHA-256 revision。`create({ rootId, path, content })` 在可写且非项目型的根目录下排他创建新的受支持文本文件。`update({ id, revision, content })` 比较所带 revision 与当前文件，并在一致时原子替换文件。`deleteEntry({ id, revision })` 采用相同校验，再把文件移入根目录下隐藏的 `.knowledge-base-trash`。目标已存在返回 `knowledge-base/already-exists`，revision 不一致返回 `knowledge-base/conflict`，修改项目知识返回 `knowledge-base/read-only`。

`listReviews()` 解析候选 YAML，返回待审核、已采纳和已拒绝卡片，以及可写的公共与方案专属知识目标。`updateCandidate()` 只替换待审核卡片中易读的 `rule`，并保留界面隐藏的依据与分类元数据。`suggestMerge()` 从当前审核会话启动配置的一次性子会话，显式调用 `mergeSkill`，并向其提供当前候选与所选目标的最新内容。结构化结果会把处理方式判断为插入、追加、替换或跳过，并返回一份尚未生效的完整草案；该操作不写入任何文件。`acceptCandidate()` 要求候选 revision、草案分析时的目标 revision，以及审核人确认过的目标文件全文；它写入该内容，再把卡片移入已采纳目录。`rejectCandidate()` 校验 revision 后把待审核卡片移入已拒绝目录。已审核卡片会记录状态与审核时间，已采纳卡片还会记录目标 id。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

已配置路径在 Host 上展开 `~`。每次请求都会从实时 Workspace 注册表重新计算项目根目录，使用 `project-<workspaceId>` 身份，并且永远不继承写权限。目录扫描忽略点号条目、符号链接与不支持的文件。读取会通过 `realpath` 解析根目录和目标，再校验规范目标仍位于规范根目录下。

SHA-256 摘要是内容 revision，不是持久数据库版本。DSH 写入方会取得每个目标的文件锁；`writeFileAtomic` 在接受更新后替换文件并保留其 mode，创建则使用排他文件创建。合并建议在审核人所选会话的已记录子会话中生成，因此模型可见输入可以从会话日志重建。子会话只接收 Host 已读取的候选字段和目标内容。候选采纳会锁定待审核卡片与目标，校验两者 revision，在卡片归档失败时回滚目标，并且只写审核人确认过的全文。移除通过把已接受目标重命名到隐藏回收目录实现，因此可以恢复，而不是直接 unlink。浏览器永远不会收到绝对根路径。

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

`suggestMerge()` 会新增一条子会话用户消息，其中包含候选标题、易读规则、适用范围、例外、所选目标以及目标文件最新全文。配置的合并技能与 persona 要求子会话在不调用工具、不修改文件的情况下返回结构化建议。普通目录、编辑、采纳与拒绝操作仍不调用模型。

#### KV Cache 影响

每次请求合并建议都会启动新的子模型请求，不复用父会话对话前缀。请求包含所选目标文件全文，因此知识文件越大，该次建议消耗的未缓存输入 token 越多。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

以下限制界定文件式管理与审核流程。

- **不能重命名或移动条目**：已支持创建、编辑和可恢复移除，但本期不支持变更路径。
- **回收恢复依赖人工**：被移除的文件保留在 `.knowledge-base-trash` 下；API 暂不列出或恢复它们。
- **目录按需读取**：外部编辑会在重新加载后出现；本包不监听根目录，也不推送失效事件。
- **revision 校验无法锁住外部编辑器**：它能阻止基于已过期 revision 的保存，但非 DSH 进程仍可能在最终比较与原子替换之间写入。
- **不展示二进制项目证据**：PDF、Office 文件、图片与任意文本扩展名仍留在 Workspace，但不属于本期文本编辑器范围。
- **没有自动萃取**：会话完成不会创建候选卡；萃取技能或其他生产方必须写入配置的 YAML 格式。
- **目标分类只是建议**：候选卡的 `suggested_destination` 会预填审核表单；合并技能只分析审核人选择的目标，审核人仍必须确认目标与合并后的完整内容。
- **生成合并建议需要兼容的活动会话**：所选会话必须携带配置的技能，并使用支持结构化一次性子会话的提供方。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。服务直接从已配置根目录与 Workspace 注册表派生每次响应，不拥有可能与二者发生一致性分歧的独立持久索引。

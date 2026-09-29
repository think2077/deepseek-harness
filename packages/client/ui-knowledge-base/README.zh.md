---
description: "知识库主面板：树形浏览、Markdown 预览，以及带 revision 防覆盖的 Host 文件更新。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-knowledge-base

[English](README.md) | 中文

## 概述

这个浏览器插件在侧栏的**新会话**上方新增全局**我的审核**与**知识库**入口，两者都有完整尺寸的主面板。**我的审核**按待审核、已采纳与已拒绝状态展示萃取出的候选知识卡。每张卡只呈现一段易读的知识建议，技术依据继续保存在文件中但不在审核界面展示。审核人可以修改这段建议、确认后拒绝，也可以选择目标并在采纳前请求一份智能插入、追加、替换或跳过建议。**知识库**继续用独立树形视图展示公共、方案专属、候选和 Workspace 文件。发生 revision 冲突时，页面会保留本地状态，不会覆盖更新后的文件。

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

在已提供布局与侧栏外壳、locale 与 slot 服务、会话控制器、共享 Remote 客户端和 Host `knowledgeBase` namespace 的 Web 组合中挂载本包。插件没有浏览器端配置。在侧栏选择**我的审核**处理候选卡。采纳操作会根据 `suggested_destination` 预填知识库与路径；**生成智能合并建议**会使用当前活动会话比较候选与目标最新内容，再展示建议的处理方式、目标章节、说明和最终 Markdown 全文。该准备步骤完成前，最终操作保持禁用；审核人可以先修改结果，再确认采纳。在侧栏选择**知识库**可以直接浏览或维护文件。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

`KnowledgeBaseController` 在 snapshot store 中持有目录、已选文档、草稿、修改状态和冲突提示。面板挂载时加载目录，只调用注入的操作。创建或保存成功后，controller 刷新目录，并继续选中 Host 返回的带新 revision 文档。移除会刷新目录；如果移除的是已选文件，还会清空详情区。发生冲突时，草稿或当前选中项保持不变。

插件以 `knowledge-review` 和 `knowledge-base` 注册两个 `sidebar.panellist` 行及其匹配的 `main` keyed 面板。`KnowledgeReviewController` 会把候选与目标 revision 传给 Host，并在变更后重新载入三种卡片状态。所有可见字符串都属于中英文词典。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | locale、侧栏入口与主面板注册 |
| [`src/client/store.ts`](src/client/store.ts) | 目录、选择、草稿和带 revision 修改的 controller |
| [`src/client/review-store.ts`](src/client/review-store.ts) | 候选审核状态与带 revision 的流转 |
| [`src/client/KnowledgeBaseSection.tsx`](src/client/KnowledgeBaseSection.tsx) | 分区知识树、创建表单、预览、编辑器与移除确认 |
| [`src/client/KnowledgeReviewSection.tsx`](src/client/KnowledgeReviewSection.tsx) | 候选卡片、修改和拒绝控制，以及采纳合并确认 |
| [`src/client/locales.ts`](src/client/locales.ts) | 中英文界面文案 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [知识库 Host 包](../../preset/knowledge-base/README.zh.md)——根目录、路径安全与 Remote 操作。
- [UI Sidebar](../ui-sidebar/README.zh.md)——本包填充的全局面板入口扩展点。
- [UI Layout](../ui-layout/README.zh.md)——侧栏入口选择的 keyed 主面板。
- [知识库管理 Agent Note](../../../.agents/notes/implemented/feature/2026-09-26-knowledge-base-management.zh.md)——第一期范围。

-----

<a id="model-experience"></a>
## 模型体验

浏览器本身不注册面向模型的内容。请求智能合并时会调用 `dsh-knowledge-base` 文档所述的 Host 操作，由 Host 创建已记录的子模型请求。

#### KV Cache 影响

浏览器不添加提示词前缀。每次请求的子会话缓存影响见 Host 包说明。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

以下限制与 Host 的第一期管理范围一致。

- **新增条目只创建 Markdown**：现有 YAML 与 JSON 文件仍可以纯文本查看和编辑；结构化表单与 diff 视图延期实现。
- **不能重命名或移动条目**：已经支持创建与可恢复移除，但路径变更延期实现。
- **界面不能恢复回收文件**：当前需要从 Host 根目录的隐藏回收目录手动移回文件。
- **外部变化需要手动重新加载**：页面没有文件系统失效订阅。
- **冲突恢复依赖人工**：页面保留草稿，但不会把它与更新后的文件合并。
- **智能合并需要兼容的活动会话**：审核人请求建议前，必须打开一个携带配置合并技能的会话。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。浏览器 controller 一次镜像一个 Host 响应，不持有重新加载后仍可能发生分歧的持久状态。

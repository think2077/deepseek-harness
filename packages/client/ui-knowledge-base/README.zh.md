---
description: "知识库主面板：树形浏览、Markdown 预览，以及带 revision 防覆盖的 Host 文件更新。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-knowledge-base

[English](README.md) | 中文

## 概述

这个浏览器插件在侧栏的**新会话**上方新增全局**知识库**入口，并打开完整尺寸的主面板。**知识库**标签在同一棵文件树中展示公共知识库、方案专属知识库与候选知识库，单独的**项目信息**标签展示 Workspace 资料。点击文件会直接打开预览或编辑区。可写根目录支持创建 Markdown、编辑和可恢复移除；随附 Web 组合中的候选知识与项目文档保持只读。修改发生 revision 冲突时，页面会保留本地状态，不会覆盖或移除更新后的文件。

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

在已提供布局与侧栏外壳、locale 与 slot 服务、共享 Remote 客户端和 Host `knowledgeBase` namespace 的 Web 组合中挂载本包。插件没有浏览器端配置。在侧栏选择**知识库**，筛选目录树，再选择文件。Markdown 条目显示格式化预览，可写条目提供编辑标签。**新增条目**会创建 Markdown 文件；**移除**需要行内确认，并把文件移入 Host 的可恢复回收目录。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

`KnowledgeBaseController` 在 snapshot store 中持有目录、已选文档、草稿、修改状态和冲突提示。面板挂载时加载目录，只调用注入的操作。创建或保存成功后，controller 刷新目录，并继续选中 Host 返回的带新 revision 文档。移除会刷新目录；如果移除的是已选文件，还会清空详情区。发生冲突时，草稿或当前选中项保持不变。

插件以 `knowledge-base` 注册一个 `sidebar.panellist` 行及其匹配的 `main` keyed 面板。所有可见字符串都属于中英文词典。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | locale、侧栏入口与主面板注册 |
| [`src/client/store.ts`](src/client/store.ts) | 目录、选择、草稿和带 revision 修改的 controller |
| [`src/client/KnowledgeBaseSection.tsx`](src/client/KnowledgeBaseSection.tsx) | 分区知识树、创建表单、预览、编辑器与移除确认 |
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

无。该包是浏览器端管理页面，不注册任何面向模型的内容。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

以下限制与 Host 的第一期管理范围一致。

- **新增条目只创建 Markdown**：现有 YAML 与 JSON 文件仍可以纯文本查看和编辑；结构化表单与 diff 视图延期实现。
- **不能重命名或移动条目**：已经支持创建与可恢复移除，但路径变更延期实现。
- **界面不能恢复回收文件**：当前需要从 Host 根目录的隐藏回收目录手动移回文件。
- **外部变化需要手动重新加载**：页面没有文件系统失效订阅。
- **冲突恢复依赖人工**：页面保留草稿，但不会把它与更新后的文件合并。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。浏览器 controller 一次镜像一个 Host 响应，不持有重新加载后仍可能发生分歧的持久状态。

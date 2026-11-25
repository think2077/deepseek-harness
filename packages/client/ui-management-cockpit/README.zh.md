---
description: "基于现有项目阶段、会话活动、失败任务和临时流程预览的只读管理驾驶舱。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-management-cockpit

[English](README.md) | 中文

## Summary

管理驾驶舱汇总 Web 客户端已有的项目、工作区、会话和后台任务数据。用户可以查看项目阶段数量、当前项目卡片、数字员工状态和近期工作，无需增加统计存储。流程弹窗仅用于临时预览：关闭、取消或保存都会丢弃全部编辑。

## Table of Contents

- [使用此包](#use-this-package)
- [了解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

将此插件与项目 Remote、标准 Web 会话服务和工作区客户端服务一起挂载。

### 何时选择

需要仅展示现有运行数据的概览时选择此包。产品需要持久化统计、业务审批或保存流程配置时，应使用独立的统计或业务后端。

### 最小配置

```yaml
- name: '@deepseek-ai/dsh-client-ui-management-cockpit'
```

此插件没有配置字段。

-----

<a id="understand-the-implementation"></a>
## 了解实现

<details>
<summary>实现内部细节——点击展开</summary>

插件通过自己的快照存储跟随项目元数据 Remote。组件在渲染时将这些项目与标准工作区及会话快照组合。流程草稿只保存在组件本地 React 状态中，不会经过浏览器传输。

| 文件 | 作用 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | 数据订阅、本地化和插槽注册 |
| [`src/client/ManagementCockpit.tsx`](src/client/ManagementCockpit.tsx) | 驾驶舱数据派生和临时流程编辑器 |
| [`src/client/ManagementCockpit.module.css`](src/client/ManagementCockpit.module.css) | 自适应驾驶舱与弹窗布局 |

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [项目管理决策](../../../.agents/notes/proposed/feature/2026-11-25-project-management.zh.md)——项目元数据和工作区归属。
- [Web 客户端子系统](../../../docs/subsystems/web-client.zh.md)——标准响应式数据和插件加载。

-----

<a id="model-experience"></a>
## 模型体验

无，因为此包只渲染浏览器状态，不注册工具、提示词内容、命令或会话事件。

#### KV Cache 影响

无；此包不组装或发送模型请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 流程编辑在弹窗关闭时按设计丢弃。
- “待审核工作成果”保持为零，因为现有投影没有业务成果审核状态。
- 近期工作按更新时间从新到旧列出持久会话；空白草稿和子代理会话不计入。数字员工列读取每个会话持久化的 `agentPreset` 投影，没有缓存值时回退为“通用助手”。项目列用会话 `cwd` 匹配工作区记录，不在项目工作区内的会话显示所属工作区标题。
- 项目风险文字使用现有项目描述和固定下一步提示，不运行风险分析模型。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>

---
description: "浏览基于智能体预设的数字员工，并在工作空间中开始对话。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-digital-employees

[English](README.md) | 中文

## 概述

浏览数字员工，搜索名称和描述，查看人设与随包技能。在已有工作空间中使用所选员工开始全新对话。目录直接读取智能体预设，不另外维护员工注册表。浏览不会挂载智能体，也不会提交提示词。

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

Web 组合以独立条目挂载本插件，在「我的工作台」与「我的审核」之间提供「数字员工」。本插件没有配置字段。它依赖布局、slot、locale、会话、工作空间导航、智能体预设 Remote 和插件清单 Remote 服务。

卡片展示预设名称、描述、来源、默认状态和配置错误。查看详情会展示该员工的人设设定与随包技能的名称、说明，不暴露插件模块名与配置值。刷新会重新读取当前列表与详情。

开始对话会在当前对话的工作空间中创建全新会话。没有当前项目时，用户选择已有工作空间。预设选择完成后才打开会话，不提交提示词。后续导航或插件卸载会阻止未完成的启动打开会话。失败会显示在页面上，并允许重试。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

浏览器分别注册主面板与侧栏条目。组件读取会忽略卸载后的完成结果；预设列表与插件清单独立报告失败。本插件不发布运行时不变式伴生入口，因为它直接从 Host 快照派生展示，不拥有可独立观察的持久状态。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [智能体预设](../../preset/agent-presets/README.zh.md)——发现和逐会话组合。
- [Web Client](../../../docs/subsystems/web-client.zh.md)——插件组合。
- [Slots](../../../docs/subsystems/slots.zh.md)——注册生命周期。

-----

<a id="model-experience"></a>
## 模型体验

### 预设对话

#### 模型看到什么

浏览不贡献模型输入。所选 `agentPreset` 拥有后续对话的能力组合。

#### Token 影响

本插件不增加提示词或工具 schema。

#### KV Cache 影响

新对话从所选预设建立前缀；浏览不会改变已有对话。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- 目录只读；编辑、复制、删除与独立员工归属不属于本插件。
- 插件条目描述能力组成，不保证每次对话都能使用所有工具。
- 工作空间必须已存在。预设选择失败可能留下未打开的空会话。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

---
description: "为替换默认 DSH 品牌的部署提供海亮数字员工协同平台侧栏标识。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-hailiang

[English](README.md) | 中文

## 摘要

`dsh-client-ui-brand-hailiang` 用提供的海亮标识、字标和“数字员工协同平台”替换 Web 侧栏与空对话页的品牌插槽。它只提供浏览器展示，不改变模型、会话或 Host 行为。

## 使用此包

在组合中使用此包替代 `dsh-client-ui-brand-official`。它通过声明感知的注册占用根作用域的 `sidebar.brand.mark`、`sidebar.brand.name` 与 `conversation.hero.brand.mark` 插槽：展开侧栏和空对话页展示海亮标识，收起的栏位保留紧凑标识。

浏览器文档标题仍是构建设置。在构建或启动 Web 应用时将 `DSH_CLIENT_TITLE` 设为 `数字员工协同平台`。

## 模型体验

无。此包只提供浏览器展示。

#### KV 缓存影响

无。

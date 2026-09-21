# Agent Note: Hailiang Web brand

Status: implemented

[English](2026-09-17-hailiang-web-brand.md) | 中文

## Problem

通用本地 Web 构建将侧栏标注为 DSH，并展示不能识别数字员工协同平台的构建元数据。

## Decision

`dsh-client-ui-brand-hailiang` 使用提供的海亮图形和本地化产品名“数字员工协同平台”占用既有根作用域侧栏与空对话页品牌插槽。Web bundle 使用该包替换官方 DSH 品牌占用包。独立的浏览器文档标题仍由 `DSH_CLIENT_TITLE` 控制。

## Alternatives considered

**修改侧栏 fallback。** 不采用，因为侧栏外壳拥有未品牌化部署的通用 fallback 行为，而部署身份应归属可替换的插槽占用包。

**复用官方品牌包。** 不采用，因为它的构建 profile 条件和 DSH 图形不属于海亮部署。

## Consequences

展开和收起的侧栏以及空对话页共享海亮标识，不改变侧栏导航或布局归属。提供的横向图形被拆分为紧凑标识和展开字标 asset。需要其他身份的部署可以通过同一组插槽替换该包。

---
description: "Hailiang Digital Employee Collaboration Platform sidebar identity for deployments that replace the default DSH brand."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-hailiang

English | [中文](README.zh.md)

## Summary

`dsh-client-ui-brand-hailiang` replaces the Web sidebar and empty-conversation brand slots with the supplied Hailiang mark, wordmark, and the product name `数字员工协同平台`. It is browser presentation only: it has no model, Session, or Host behavior.

## Use this package

Compose this package instead of `dsh-client-ui-brand-official`. It occupies the root-scoped `sidebar.brand.mark`, `sidebar.brand.name`, and `conversation.hero.brand.mark` slots through declaration-aware registrations, so the expanded sidebar and empty conversation show the Hailiang identity while the collapsed rail retains the compact mark.

The browser document title remains a build setting. Set `DSH_CLIENT_TITLE` to `数字员工协同平台` when building or starting the Web application.

## Model Experience

None. This package contributes browser presentation only.

#### KV Cache effect

None.

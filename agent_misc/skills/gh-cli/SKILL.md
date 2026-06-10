---
name: gh-cli
description: Intercept GitHub URL fetches and redirect to the authenticated gh CLI. Use when Claude needs to access private repos, avoid rate limits, or fetch GitHub content with authentication.
---

# gh-cli

A Claude Code plugin that intercepts GitHub URL fetches and redirects Claude to use the authenticated `gh` CLI instead.

## Problem

Claude Code's `WebFetch` tool and Bash `curl`/`wget` commands don't use the user's GitHub authentication. This means:

- **Private repos**: Fetches fail with 404 errors
- **Rate limits**: Unauthenticated requests are limited to 60/hour (vs 5,000/hour authenticated)
- **Missing data**: Some API responses are incomplete without authentication

## Solution

This plugin provides:

1. **PreToolUse hooks** that intercept GitHub URL access via `WebFetch` or `curl`/`wget`, and suggest the correct `gh` CLI command
2. **A `gh` PATH shim** that blocks anti-patterns: API `/contents/` fetching and non-session-scoped temp directory clones
3. **A SessionEnd hook** that automatically cleans up cloned repositories when the session ends

## Prerequisites

- [GitHub CLI (`gh`)](https://cli.github.com/) must be installed and authenticated (`gh auth login`)
- If `gh` is not installed, the hooks pass through without disruption

## Installation

```
/plugin marketplace add trailofbits/skills
/plugin install gh-cli
```

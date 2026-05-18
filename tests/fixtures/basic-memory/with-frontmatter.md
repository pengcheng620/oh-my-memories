---
title: JWT Authentication Patterns
tags: [security, jwt, auth]
type: decision
permalink: knowledge/jwt-auth-patterns
created: 2026-05-01T10:00:00Z
updated: 2026-05-10T15:30:00Z
---

We decided to use short-lived access tokens (15min) with opaque refresh tokens stored server-side.

## Key decisions

- Access tokens: JWT, 15 min TTL
- Refresh tokens: opaque, stored in Redis
- Rotation: on every refresh

---
name: Secret encryption at rest
description: How integration API keys are encrypted in the settings table and read back
---

Integration secrets (github_token, notion_api_key, openai_api_key) that users enter via the Integrations UI are encrypted before being stored in the `settings` table.

- Module: `server/config/crypto.js` — AES-256-GCM, key = sha256(SECRET) where SECRET is SESSION_SECRET/JWT_SECRET.
- Stored format: `enc:v1:<iv_b64>:<tag_b64>:<ciphertext_b64>`.
- `decryptSecret` passes through any value WITHOUT the `enc:v1:` prefix unchanged — this keeps env-provided values (plaintext) and any legacy plaintext rows working.

**Why:** plaintext API keys in the DB were a real security exposure (DB dump = all third-party creds).

**How to apply:** encrypt on write in `integrations.js` PUT /:service/config; decrypt on read in the getters (`getGitHubToken`, `getOpenAIKey`, `getNotionConfig`/`getExtendedNotionConfig`). If you add a new secret setting, encrypt at the write site and wrap its read in `decryptSecret`. Rotating SESSION_SECRET invalidates existing encrypted values (decrypt fails closed → returns '').

# AI Studio v2 — VVD CPA (integration notes)

## Existing services (no new Mini App)
Frontend: GitHub Pages `https://vitalujs2233.github.io/vvd-cpa/`.
Backend: Render `https://vvd-cpa-v2.onrender.com`, root `backend_v2`.
Storage and PostgreSQL: existing Supabase project. Do not use the CPA account's `users.balance` to fund AI.

## Production configuration (Render → vvd-cpa-v2 → Environment)

Required for **media upload**:
- `SUPABASE_URL`: existing Supabase project URL (not secret).
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase server-side secret. Add it ONLY through the Render dashboard. Never put it into the repository or Vite/frontend environment variables.
- Apply `migrations/20261016_ai_studio_v2.sql` and `migrations/20261016_ai_private_media_bucket.sql`. Bucket `ai-character-media` stays PRIVATE and is accessed through backend verification / temporary preview signatures.

Required for **real AI responses**:
- `AI_API_KEY`: server-side API key for an authorized OpenAI-compatible model endpoint.
- `AI_API_BASE`: default `https://api.openai.com/v1`; must be a trusted HTTPS API endpoint.
- `AI_MODEL`: model ID supported by that endpoint; default is `gpt-4o-mini`.

Existing `BOT_TOKEN` is used to validate signed Telegram WebApp `initData`; existing `DATABASE_URL` points to PostgreSQL. Do not create a second user system or disable signature validation.

## Routes
Owner authenticated with signed Telegram initData: `/tools/ai`, `/tools/ai/new`, `/tools/ai/:id`; backend API under `/tools-market/ai` and `/ai-studio/models`.
Public without Telegram authentication: `https://vitalujs2233.github.io/vvd-cpa/model/<slug>`, served using existing GitHub Pages 404 fallback.
Public backend: `POST /ai-studio/public/<slug>/session`, `POST /ai-studio/public/<slug>/messages`, `POST /ai-studio/public/<slug>/click`.
Messages and usage are recorded in the existing PostgreSQL instance, not a separate app.

## What is gated
- External links: **paid AI replies are disabled** until real USD pricing, approved payment collection, balance reservation/debit, refund logic and idempotent settlement have been implemented. There is no artificial debit, purchase or credit.
- Smartlink chats: AI replies require a real `AI_API_KEY` and a backend-verified owner smartlink. A limit of 100 messages per session, a session-create rate limit, and per-IP message throttling protect the first version.
- Uploads require valid media files and a rights attestation; current image checks validate format and size but **there is no integrated image-content moderation yet**. The photo library and metadata are stored, but automatic image sharing is NOT enabled. Connect and test content moderation before enabling automatic distribution.
- 18+ self-declaration is required for affiliate click-through. This is not identity/age verification. Confirm the destination advertiser's age rules and obtain appropriate legal age assurance before campaigning.
- The public header does not pretend a human is online, and the chat clearly identifies an AI character.
- Existing `initData` expires on the backend after 1 hour. When that happens, completely close and reopen the Mini App from the Telegram bot. This strict security check is not bypassed.

## Verification
1. Open the Telegram Mini App, navigate **Инструменты → AI Модель**, create a character, and save.
2. Select a smartlink owned by the current account. The backend rejects links belonging to a different Telegram user.
3. Upload an image with rights confirmation (requires configured private Storage service key). Add photos and avatar, reload editor to verify persistence.
4. Publish, open the given `/model/<slug>` URL in an external browser, verify that the visitor is anonymous and the AI disclosure is visible.
5. With `AI_API_KEY` configured, send a message and check that an actual provider response and stored chat history appear. With no key, the input remains unavailable.
6. To inspect stats: character list shows real visits, session counts, responses and clicks.
7. Before enabling paid replies, build and test a transactional USD ledger and provider cost tariff. Do not infer pricing from the browser.

## Security follow-up
Existing CPA tables outside this change have been reported by Supabase as having RLS disabled. Review them separately, with proper policies, before exposing additional Supabase Data API endpoints. Do not blindly enable RLS on existing CPA tables, which could break the platform.

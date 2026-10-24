# Existing AI chat: Gemini configuration

Scope: existing AI Model constructor/public chat only. No schema migration,
new wallet, billing, Telegram authentication or other sections changed.

Render vvd-cpa-v2 environment (merge keys; never replace the environment):

- `AI_API_KEY`: private Gemini Developer API key from Google AI Studio. Never put it in frontend code, GitHub or chat.
- `AI_API_BASE`: `https://generativelanguage.googleapis.com/v1beta/openai/`
- `AI_MODEL`: `gemini-3.5-flash-lite`
- `AI_FREE_DAILY_MESSAGES`: existing per-model rolling-day cap (default 100).

Official references checked 2026-10-24:
- https://ai.google.dev/gemini-api/docs/openai
- https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/rate-limits

Flash-Lite accepts images for classification but this application does not generate
images. Google lists free-tier text/image input and text output for this model.
Actual RPM/TPM/RPD limits depend on the Google project/tier; inspect AI Studio.
Free-tier data may be used by Google to improve products. No Google billing is
activated by this code and no webmaster wallet is debited. A billing-enabled key
can nevertheless incur provider charges; use a free-tier Google project for the
requested initial launch.

A chat turn can make up to three provider calls: photo selection, image safety
classification and text generation. Each call has a 20-second network timeout;
the turn is bounded to 65 seconds, browser waiting to 75 seconds. No automatic
message retry is performed. Provider failures return an error, never a fake reply.
An attempted turn reserves the existing daily allowance before calling the provider
so concurrent requests and failures cannot bypass it. Reservations cost $0 and
remain counted for the rolling day even after provider failure. Existing IP,
session and interval limits remain in place. PostgreSQL advisory locking prevents
concurrent turns for the same visitor token across workers.

Photos are selected only from that model and owner's existing library, without
repeating already sent images in the same session. Mode/auto_allowed/send_rule
are checked; a nonempty rule is always a constraint. The provider evaluates
free-text rule relevance and must independently classify the actual stored image
as safe. Unknown/failed classifications suppress the image. Enabling automatic
sending requires the same check. Existing enabled photos are checked again when
sent. This is model-based moderation, not an absolute content guarantee.
Photo permissions are rechecked after provider calls before storing the reply.
Only an existing photo_id is saved in tool_ai_messages. No images are deleted or
replaced. History restores the latest 100 messages with existing attachments.

Existing external-link chats remain disabled until their existing pricing workflow
is configured; this change does not bypass that restriction. Marina uses smartlink.

## Verification

Local mocked-provider checks:
`PYTHONPATH=backend_v2 python -m unittest discover -s backend_v2/tests -p 'test_ai_chat_provider.py' -v`

Database integration suite, only against a disposable test PostgreSQL database:
`python -m unittest discover -s backend_v2/tests -p 'test_ai_studio_v2.py' -v`

Frontend: `npm run build`.

Final live acceptance requires the real private key on Render and a successful
redeploy. Open /model/marina, send a neutral greeting, share a neutral fact and
ask about it, request an allowed photo, reload and confirm history. Also verify
photo-rule editing, publication and the unchanged 18+ advertising action.
Do not mark the real-provider acceptance complete based on mocked tests.

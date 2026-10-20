# VVD IQ Play — approved visual direction and implementation contract

Status: design approved; implementation pending. This branch is isolated from production.

## Visual direction
Black / premium gold mobile Telegram Mini App, matching the six approved screens:
1. Compact IQ Play entry next to Движ in Home header.
2. Game lobby with player XP, level, league, achievements and start.
3. 15-question round, four answers and server-authoritative timer.
4. First mistake burns one life; 10-second retry on the same question, rejected option disabled.
5. Game over on second mistake.
6. Victory with XP breakdown, league progress and achievements.

## Mechanics
- Q1–3: 30s; Q4–9: 25s; Q10–15: 20s.
- First-attempt correct: +100 XP; retry correct: +50 XP.
- Completed 15 questions: +300 XP.
- One spare life per round; timeout counts as an error.
- Retry deadline starts on the server at the first error, not on client button click.
- No real money, CPA balance, hold, withdrawals, Stars or paid entries involved.
- At least 150 editorially reviewed CPA learning questions in v1; no repeats until available pool exhausted.
- 30 levels in six leagues; seven achievements; game-only stats.
- Questions versioned; never expose correct answer before final resolution.

## Isolation and security
- New backend router and independent iq_* tables/migration.
- Signed Telegram initData authentication on every game endpoint.
- Server timestamps, transactions, row locks and idempotency for answer processing.
- One active round per player; deterministic resume after reconnection.
- Admin CRUD restricted to verified administrators; keep audit events.
- Separate migration scripts only; do not run against shared Supabase without explicit approval.
- Preserve all existing financial and CPA code paths.

## Release gate
- All changes only in feature/vvd-iq-play.
- Add frontend/backend tests and validate build before review.
- Open draft PR for inspection.
- Never merge to main, publish GitHub Pages, deploy Render or migrate production Supabase without explicit owner authorization.

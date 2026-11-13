# VVD CPA: RU / EN localization — paused rollout

**Status:** PAUSED. Russian is the only visible interface language for both the guest website and signed-in website / Telegram Mini App. No UI language selector is shown.

## Quick re-enable (after translations are complete)

The **single feature flag** is `LOCALE_SWITCH_ENABLED` in `src/shared/lib/locale.ts`. It is currently `false`.

- `getLocale()` returns `ru` regardless of a previously saved `en` value. This avoids a half-translated interface.
- `setLocale()` does nothing while paused; the user's earlier localStorage preference under `vvd:interface-locale` remains stored, not deleted.
- The original browser / Telegram language inference, React `useLocale()` subscription, storage event and bilingual strings are **preserved**.
- Both RU/EN controls are wrapped with this flag, **not deleted**:
  - Guest website header: `src/pages/public/PublicWebsite.tsx`.
  - Signed-in web and Telegram Mini App profile: `src/pages/profile/Profile.tsx`.
- When the flag is eventually enabled, automatic first-visit language detection and the stored preference will work as originally implemented; test behavior with previously saved EN and RU values.

## Already implemented

- `src/shared/lib/locale.ts`: language inference, persistence, `useLocale` and `localize`.
- `src/pages/public/PublicWebsite.tsx`: translations for the main guest intro, navigation, steps, article *teasers*, sign-in CTA, footer and Why VVD CPA heading.
- `src/pages/public/GuestInfoEnglish.ts`: English copies of seven **currently published** Why VVD CPA information sections, including descriptions and expanded body text. Both guest web and Mini App use this module, and its source-title/description check prevents stale translations when content is edited in the admin panel.
- `src/pages/info/InfoPage.tsx`: English Why VVD CPA content using the shared copies; Back and fallback labels.
- `src/pages/home/Home.tsx`: first-phase signed-in home, balance headings and shortcuts.
- `src/App.tsx`: main bottom navigation.
- `src/pages/profile/Profile.tsx`: language setting and some account labels.
- `src/pages/public/PublicWebsite.css`: RU/EN pill styles, retained for later use.

## Still missing before a production EN rollout

1. Translate remaining Mini App / signed-in website screens, including offers, analysis, catalog/services, support tickets, financial/withdrawal pages, notifications, errors, settings, and admin-specific workflows.
2. Translate games (including Dvizh / IQ Play as applicable), start screens, animation overlays, labels and in-image text, without changing game logic.
3. Provide separate EN image assets for banners and artwork containing Russian text (e.g. the world map banner). Choose assets based on locale, keeping layouts responsive.
4. Support RU/EN for admin-published articles, offer/service descriptions, informational blocks, editorial pages and new material. Decide whether bilingual fields are managed in admin or as versioned translations. Do **not** automatically translate on each render.
5. Review legal/policy texts, email/Telegram messages, metadata/SEO, loading/error states, accessibility text and localization tests.
6. Confirm language consistency across public guest website, signed-in website and Telegram Mini App. Check narrow phones, switching without reload, navigation, caching and localStorage behavior.
7. Re-enable `LOCALE_SWITCH_ENABLED` only after English coverage is sufficient for the user's actual workflows.

**Do not** remove existing EN strings or reset language preferences just to hide the switch. Also do not change balance calculations, payout logic, authentication, or game mechanics when restarting localization.

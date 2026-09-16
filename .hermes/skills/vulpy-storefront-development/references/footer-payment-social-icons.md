# Footer payment icons & social icons — file map and swap recipe

Everything the operator asks about when they say "change the footer icons /
socials / payment logos" lives in code + seed, not in the rendered components
alone. Map (verified 2026-08-29):

| What | File |
|---|---|
| Social icon renderer (react-icons/fa6 map) | `apps/storefront/src/components/Common/SocialIcon.tsx` |
| Footer layout (renders socials + help columns + logo + payment strip) | `apps/storefront/src/components/Footer/index.tsx` |
| Footer payment-method strip | `apps/storefront/src/components/Common/PaymentMethodIcons.tsx` (renders `siteSettings.paymentMethods`) |
| Default social links | `apps/storefront/src/lib/cms/defaults.ts` → `defaultSocialLinks` |
| Default payment methods | `apps/storefront/src/lib/cms/defaults.ts` → `defaultPaymentMethods` |
| Payload site-settings seed (persists socials + payments into the DB) | `apps/storefront/src/scripts/seed-payload-core.ts` |
| Payment SVGs | `apps/storefront/public/images/payment/payment-0N.svg` |

## Identifying the payment-brand SVGs by viewBox ratio

The seed payment icons carry NO brand text inside the SVG — identify them by
viewBox `w h`:

| File | viewBox | Brand |
|---|---|---|
| payment-01.svg | 66×22 | PayPal (double-P lockup) |
| payment-02.svg | 21×24 | Visa |
| payment-03.svg | 33×24 | Mastercard |
| payment-04.svg | 53×22 | Amex |
| payment-05.svg | 57×22 | Discover |

So "remove the PayPal logo from the seed" = drop `payment-01.svg` from
`defaultPaymentMethods` (+ the Payload site-settings seed if it persists
methods).

## Social icon swap — LinkedIn out, TikTok/Pinterest in

`react-icons/fa6` exports `FaTiktok` and `FaPinterest`/`FaPinterestP`
(verified present in the installed package). Keep `normalizePlatform`
lowercase mapping and the `x` → `twitter` alias; the footer renders
`siteSettings.socialLinks.map(...)` so no Footer component change is needed —
edit the icon map + the defaults list.

**Live-DB caveat:** changing `defaultSocialLinks` only affects fresh seeds.
The Payload `site-settings` global persists its own copy; either reseed with
the updated seed script or edit in Payload admin, or the old icons stay.

## Verification checklist

- Change BOTH `SocialIcon.tsx` (icon map) and `defaults.ts` entries, plus the
  seed script's site-settings global if it persists the lists.
- Update any unit test that asserts icon/payment count or labels.
- Footer renders inside `SiteLayoutClient` behind the PreLoader client gate —
  bare `curl` shows footer DATA in the flight payload but no `<footer>` tag.
  Verify visually in a browser, or grep the flight payload, not the DOM.
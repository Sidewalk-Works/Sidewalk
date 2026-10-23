# Visual review

Screenshots of the **running application** (production build, real API and database), captured by
`SCREENSHOTS=1 pnpm test:e2e -- screenshots.spec.ts` at 1440×900 (`desktop/`) and a phone width (`mobile/`).
They are not mockups. Seeded reports carry no invented photographs, so lists show “No photo” placeholders.

Screens reviewed: home, explore (list and map), issue detail (acknowledged, and resolved-but-unverified), how it works,
accountability, register, report flow (steps 1–4 and confirmation), dashboard, account, moderation queue, moderation
reports, issue detail with staff tools.

Account lifecycle and notifications (screens 19–28): confirm-your-email (waiting, link ready, confirmed), forgot password
(asking, sent), choose a new password, an incomplete reset link, the notification centre with an unread item, account
email settings, and the administrator's email-delivery page.

## Against the design brief

| Brief                                           | Result                                                                                                                                                                                                         |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editorial, information-led, not dashboard-first | Large serif headlines, ruled lists, one primary action per section. No identical card grids.                                                                                                                   |
| America.gov as inspiration, not template        | Borrowed: confident display serif, plain declarative section headings, generous whitespace, a single dominant action. Own identity: warm paper, green ink, laterite accent, kerb mark, ruled editorial layout. |
| Real photography, never passed off as evidence  | Six openly licensed Wikimedia Commons photographs, each captioned “Illustrative photograph, not a report made on Sidewalk”, credited at `/credits`.                                                            |
| No fabricated statistics or activity            | Numbers come from the database. With no data the page says so.                                                                                                                                                 |
| Status without relying on colour                | Every status is a word first; colour reinforces.                                                                                                                                                               |

## Problems found and fixed during review

- Featured recent report rendered a large empty block when it had no photograph → typographic layout without an image slot.
- Filter form showed stale values after removing a filter chip → form is keyed to the active filters.
- Pressing “Continue” blurred a field, its error line collapsed, the button moved and the click was lost → error space is reserved.
- “Continue” could turn into the submit button mid-click and send the report early → distinct button keys and a final-step guard.
- A button inside a `<dl>` row failed the axe definition-list rule → moved inside the `<dd>`.
- Header wordmark tap target was under 36 px → 44 px.
- Forms submitted before hydration would have put credentials in the URL → `method="post"` and disabled until hydrated.
- On phones the header's “Report an issue” button was never hidden (its `hidden` class lost to the button's own
  `inline-flex`), so every page was ~441 px wide on a 360–412 px screen and scaled down. The old overflow check compared
  against `window.innerWidth`, which a phone browser widens to fit the overflow, so it could not see this. Fixed with
  `max-sm:hidden`; the check now compares against the device width, and a 360 px test covers the header with the new bell.
- The notification bell kept a stale count after a notice was read (the header lives in a layout that client navigation
  keeps) → the bell now follows read/unread actions immediately; the server count still wins on every full load.
- The admin email-delivery summary put a paragraph directly inside a `<dl>` (axe: definition-list) → the explanation moved
  inside the `<dd>`.
- A truncated reset link said it “may have been used already” → it now says the link is incomplete, as the confirmation
  page does.
- A long email address in the “check your email” notice could not wrap and widened the page on a 360 px screen → it wraps.

## Known visual limitations

- The hero photograph's source is 1280 px wide, slightly soft on very large screens.
- Map tiles are OpenStreetMap’s public server (development use only).

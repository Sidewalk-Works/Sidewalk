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

Verified organizations (screens 31–47, desktop and mobile, `organizations-screenshots.spec.ts`; the desktop and
mobile captures are separate runs because the first leaves the seeded report claimed and verified): the directory; a
verified profile with its metric definitions; a report with an official acknowledgement; an invalid invitation link;
the application form, and a submitted application; a member’s profile and the team page; a representative’s view of a
report and the resolution-claim dialog; the same report after a claim (“claimed, not verified”) and after independent
verification; the staff application queue, an application under review, an organization’s governance page and the
official-responses queue; and a suspended profile.

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

- Organization review (found while building it): the “Verified only” checkbox was 20 px, below the tap-size check →
  24 px with a full-height label; “Remove” on a reference row was an unlabelled trash icon floating alone on a phone → it
  has a word; “Complete the highlighted details” appeared far above the Send button on a phone and named no field → the
  message is next to the buttons and lists what is missing, and the role and authority fields are marked required;
  a suspended profile read “…its representatives may speak for it” → it now says first that it cannot speak while
  suspended.
- Organization review, behaviour: hiding an official response left its words visible in the timeline excerpt, the
  report’s resolution note and the claim’s photographs → all are withheld from everyone but staff and the organization
  (`official-responses.spec`, and journey 11 in the browser).

## Review audit, 27 Oct 2026

An earlier report said 34 screenshots were captured and only five inspected; nothing in the repository records which
five, so the list of "screens reviewed" above is not evidence of inspection. This pass looked at the images themselves.

Inspected image by image on 27 Oct 2026 (desktop unless noted): 31–34, 35, 36, 37, 38, 40, 41, 44, 45, 46, 47, and
mobile 31, 38, 40, 44. For every mobile image the width was checked from the file (390 px, 30 is 360 px), so none was
captured wider than the phone; the 360/412 px e2e tests assert there is no horizontal scroll. **Not** inspected
individually in this pass: desktop 1–30, 39, 42, 43; mobile 1–29, 32, 33, 35–37, 39, 41–43, 45–47 (and mobile 29 does not
exist: the healthy email-delivery state is only captured on desktop). They are covered by the automated layout, axe and
overflow checks, not by a human look.

Found and fixed:

- **47 (suspended profile) was stale and still contradictory.** The committed image predates an earlier fix, and the
  current code still appended “its representatives may speak for it” after the suspension sentence. The panel now says
  only that the organization cannot speak while suspended and that earlier statements stay on the record.
  `47-organization-suspended.png` (desktop and mobile) was regenerated after the change and the new desktop image was checked. The capture run also re-took other screenshots whose spec ran with `SCREENSHOTS=1`, so many committed images differ from before; those were not re-inspected.

Observed, left as is: the team page shows “Remove” on the signed-in administrator's own row (the server refuses to remove
the only administrator, and “Leave” exists); long URLs in the staff application review wrap mid-word on a phone.

Not captured: screenshots of revoked-verification, hidden-statement, empty-list and permission-denied states do not
exist. Those states are asserted by API and browser tests (`official-responses.spec`, `organization-governance.spec`,
journeys 9–11 in `organizations.spec.ts`) but have no image.

## Known visual limitations

- Photographs in the organization screenshots are a plain test fixture, so the “photographs supplied by the organization”
  areas show a dark rectangle; the layout, not the content, is what is being reviewed.
- The hero photograph's source is 1280 px wide, slightly soft on very large screens.
- Map tiles are OpenStreetMap’s public server (development use only).

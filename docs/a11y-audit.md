# Accessibility Audit — AutoPlanner (crammed.app)

**Standard:** WCAG 2.1 Level AA
**Date:** 2026-07-28 (rev. 4 — post UI pass: heading fixes, /grades routed, error surface)
**Scope:** Complete frontend source at `frontend/src/` — 6,991 lines across 6 pages and 17 components
**Method:** Static source analysis + live computed-style measurement + real-app keyboard testing against a local full stack
**Auditor:** Claude Code

---

## Scope and caveats — read first

### This is not a Next.js app

The brief specified Next.js. It's a **Vite + React 18 SPA** with `react-router-dom` v6 — `<div id="root">`, `assets/index-*.js`, no `__NEXT_DATA__`, no `next` dependency. No App Router, no Server Components, no `next/image`. Relevant because several standard Next.js remedies (`next/link` focus handling, `metadata` exports) don't apply.

### Code has changed since the original "do not change any code" instruction

You approved a **Phase 1** remediation earlier in this session, so two design tokens in `frontend/src/src/index.css` are already modified. This audit reflects **current state**. Three findings from rev. 1 are consequently already resolved and are marked ✅ FIXED rather than deleted, so the history stays legible.

**Rev. 3:** you have since approved and landed **Phase 3** — all six modals migrated to `@radix-ui/react-dialog` on branch `radix-dialog-migration`, one commit per modal atop a reconstructed pre-migration baseline. B-02 is now closed and M-04 is reclassified. **Line numbers in the six modal files have shifted** and are re-scanned throughout this revision.

I have changed no code *as part of this audit*; the Phase 1 and Phase 3 changes were separately approved remediation work.

### ⚠️ Correction to rev. 2: Radix was **not** already a dependency

Rev. 2 asserted that `@radix-ui/react-dialog` was "already a dependency" and that migrating "adds no new vendor." **That was wrong.** The installed Radix packages (`react-label`, `react-slot`, `react-toast`) do not include `react-dialog`, and it was absent from `package.json`, `package-lock.json`, and `node_modules`. Phase 3 had to install it (`^1.1.23`), plus `@radix-ui/react-visually-hidden` (`^1.2.11`), which was likewise only present transitively.

The effort estimate for Phase 3 was not affected, but the "no new vendor" justification was unfounded and is retracted.

### Coverage

| Route | Component | rev. 1 | rev. 2 | rev. 4 |
|---|---|---|---|---|
| `/` | `pages/LandingPage.tsx` | ✅ live | ✅ source + live | — |
| `/login` | `pages/LoginPage.tsx` | ✅ live | ✅ source + live | — |
| `/signup` | `pages/SignupPage.tsx` | ✅ live | ✅ source + live | — |
| `/dashboard` | `pages/DashboardPage.tsx` | ❌ auth-gated | ✅ **source** | ✅ live |
| `/today` | `pages/TodayPage.tsx` | ❌ auth-gated | ✅ **source** | ✅ live |
| `/grades` | `pages/GradesPage.tsx` | ❌ not found | ✅ source | ✅ **live — route added rev. 4** |

### ⚠️ Correction to rev. 1–3b: GradesPage had no route

Rev. 1 recorded the grades view as "❌ not found" and moved on. Rev. 2 then audited it *from source* and promoted it to covered. **Nobody checked whether it was reachable.** It was not: `GradesPage` was exported and imported nowhere, with no `<Route>` anywhere in `App.tsx`. 965 lines that never rendered for any user.

This is not a footnote — it distorted this audit's own priority ranking. Rev. 2 called it "the worst-affected file" and attributed to it 6 of the 12 unassociated labels (B-01a), 4 of the zero-name controls (B-01b), plus **S-05** and **S-06** entirely. Every one of those was unreachable, while the effort estimates and the "highest-leverage fix" callout treated them as live user-facing defects.

The lesson for future revisions: *source presence is not coverage.* A file being large and full of findings says nothing about whether a user can reach it. Confirm the route before ranking the file.

**As of rev. 4 the route exists** (`/grades`, protected, plus a nav tab on `/today` and `/dashboard`), so those findings are now genuinely live and the ranking is finally accurate — but it became accurate by adding a route, not because the original assessment was right.

Telling detail: `GradesPage` already rendered its own three-tab nav with **Grades** marked active. It was written expecting a route that was never wired up.

### Still not verified

| Area | Status |
|---|---|
| **Keyboard traps (2.1.2)** | **Largely resolved in rev. 3b.** Modal dismiss behaviour (Escape, outside-click, scroll lock, dialog role, accessible name) is observed per modal — see B-02. **Focus restoration is now observed in the real app** against a local backend, which found and fixed a regression — see B-04, with one open follow-on in M-09. Still **not** observed: Tab-cycle order within an open dialog; the eval context reports `innerWidth: 0` and synthetic Tab does not move focus, so that remains taken on trust. Element geometry is meaningless in that context and was read from screenshots instead. |
| **Screen reader output** | No VoiceOver/NVDA pass. Accessible-name findings are computed from markup, which is reliable, but announcement quality is not. |
| **Error states (3.3.1/3.3.3)** | Would require submitting invalid data against live auth. Not done. |
| **Reflow (1.4.10), target size** | Requires a real viewport. |

---

## Summary

| Severity | Count |
|---|---|
| 🔴 Blocker | 3 |
| 🟠 Serious | 6 *(was 7 — S-04 closed; S-10 opened then closed same revision)* |
| 🟡 Moderate | 6 |
| **Total open** | **15** *(was 16)* |
| ✅ Fixed in Phase 1 | 3 |
| ✅ Fixed in Phase 3 | 3 (B-02, M-04, B-04) |
| ✅ Fixed in rev. 4 | 2 (S-04, S-10) |
| ❌ Retracted (false positive) | 2 |

**Estimated remaining effort: 13–22 hours** (S-04's 30 min spent; S-10 found and fixed within rev. 4).

**Rev. 3b:** running the app locally against a real backend surfaced a focus regression the isolated harness could not see (B-04, fixed) and one follow-on issue (M-09, open). Two backend defects unrelated to accessibility were also found — see the appendix.

**Rev. 4:** S-04 is fixed and measured. A UI pass also uncovered that **`GradesPage` was never routed** — see the correction below, which invalidates part of this audit's own priority ranking — and that user-facing error text was leaking internal diagnostics (new **S-10**).

**Highest-leverage fix:** 18 form controls across the authenticated app have no accessible name, and 12 visible `<Label>` elements are not programmatically associated with their inputs. A screen reader user cannot fill in the grade-entry or schedule-input forms — the core product workflows.

---

## 🌐 Global / cross-cutting

### 🔴 B-01 — 18 form controls with no accessible name *(was 19; one retracted in rev. 3)*

| | |
|---|---|
| **WCAG** | 4.1.2 Name, Role, Value (A) · 1.3.1 Info and Relationships (A) |
| **Severity** | Blocker |
| **Effort** | 4–5 hrs |

53 form controls exist. 31 have an `id`, and 18 have no accessible name from any source. *(Rev. 2 said "**0 have `aria-label`**" — that is no longer true: the five modal close buttons gained `aria-label="Close"` in Phase 3. No **form control** has one.)*

Two distinct defects:

**(a) 12 `<Label>` elements with no `htmlFor`** — the label is visible but not associated. Sighted users see it; screen readers don't connect it.

| File | Lines (rev. 4, re-scanned) | rev. 3 | rev. 2 |
|---|---|---|---|
| `frontend/src/src/pages/GradesPage.tsx` | 393, 401, 407, 412, 419, 428 | same | same |
| `frontend/src/src/components/PreferencesModal.tsx` | **173, 214, 235** | 170, 211, 232 | 176, 217, 238 |
| `frontend/src/src/components/EditItemModal.tsx` | **141, 186** | 138, 183 | 141, 186 |
| `frontend/src/src/components/OnboardingModal.tsx` | 290 | 290 | 288 |

Still 12 unassociated labels; none have been addressed, only their line numbers have moved (the depth pass in rev. 4 shifted the modal files again).

**Re-rated in rev. 4:** the six `GradesPage` entries were unreachable until this revision added the `/grades` route — see the coverage correction. They are now genuinely live, which makes this finding's user impact materially higher than it actually was when rev. 2 ranked it highest.

Example — `GradesPage.tsx:419-421`:
```jsx
<Label>Category</Label>                       {/* no htmlFor */}
<select value={form.category} …>              {/* no id      */}
```

**(b) Controls with no label, no `aria-label`, and no placeholder — zero accessible name:**

| File:line (rev. 3) | was | Control |
|---|---|---|
| `components/FileImportModal.tsx:118` | 117 | checkbox |
| `components/FileImportModal.tsx:134` | 133 | text |
| `components/FileImportModal.tsx:420` | 424 | file (visually hidden) |
| `components/ScheduleInputModal.tsx:143` | 142 | date |
| `pages/GradesPage.tsx:269` | — | number (inline score editor) |
| `pages/GradesPage.tsx:276` | — | number (inline score editor) |
| `pages/GradesPage.tsx:420` | — | select |
| `pages/GradesPage.tsx:429` | — | date |

**❌ Retracted in rev. 3 — `components/ScheduleInputModal.tsx:343` (now :331), textarea.** False positive. It carries `placeholder={EXAMPLE_TEXT}`, so it is not nameless. It is still weakly named — placeholder-only, same defect class as M-01 — but it does not belong in "zero accessible name." Count drops 19 → 18.

**Fix:** add `htmlFor`/`id` pairs. For the inline editors at `GradesPage.tsx:269,276`, use `aria-label={`Score for ${assignment.title}`}`.

---

### ✅ B-02 — Six modals with no dialog semantics and no focus trap — **FIXED (Phase 3)**

| | |
|---|---|
| **WCAG** | 4.1.2 Name, Role, Value (A) · 2.4.3 Focus Order (A) |
| **Severity** | ~~Blocker~~ → closed |
| **Effort** | 5–6 hrs estimated · spent |
| **Landed** | branch `radix-dialog-migration` — `5d0fc08`, `b12030e`, `4afddf0`, `c3b46e9`, `e4a90c2`, `33dbd92` (one commit per modal) |

All six migrated to `@radix-ui/react-dialog`. Each is now `Dialog.Root → Portal → Overlay + Content`, with the hand-rolled Escape listeners and overlay `currentTarget` click handlers deleted in favour of Radix's dismissable layer. A re-scan confirms **zero** remaining `e.target === e.currentTarget` handlers and **zero** remaining `key === "Escape"` dismiss listeners across the six files.

| Modal | Root | `role="dialog"` | Accessible name | Escape | Outside click |
|---|---|---|---|---|---|
| `OnboardingModal.tsx` | :396 | ✅ | ✅ VisuallyHidden — "Getting started" | 🔒 blocked *(by design)* | 🔒 blocked *(by design)* |
| `EditItemModal.tsx` | :66 | ✅ | ✅ "Edit Class" | ✅ closes | ✅ closes |
| `ConnectAccountModal.tsx` | :337 | ✅ | ✅ "Connect School Account" | ✅ closes | ✅ closes |
| `ScheduleInputModal.tsx` | :263 | ✅ | ✅ "Add Assignment" | ✅ closes | ✅ closes |
| `PreferencesModal.tsx` | :100 | ✅ | ✅ "Planner Preferences" | ✅ closes | ✅ closes |
| `FileImportModal.tsx` | :347 | ✅ | ✅ "Import Files" | ✅ / 🔒 while processing | ✅ / 🔒 while processing |

Every `Dialog.Title` renders an `<h2>` wired through `aria-labelledby`. The three modals with real subtitle copy (`ConnectAccount`, `ScheduleInput`, `FileImport`) also gained a `Dialog.Description`; the other three pass `aria-describedby={undefined}` rather than inventing description text to satisfy the primitive.

The five icon-only close buttons became `Dialog.Close` and all carry `aria-label="Close"`. `OnboardingModal` has no close control at all, by design.

**`FileImportModal` retains its processing guard.** `handleClose` already refused to close while `state === "processing"`; `onEscapeKeyDown` and `onPointerDownOutside` now `preventDefault()` in that state so Radix cannot dismiss the dialog behind that guard. Verified by stalling `fetch` to park the modal in `processing` — neither gesture closes it there, and both still close it in `upload`.

#### ⚠️ Correction to rev. 2: Radix does not set `aria-modal`

Rev. 2 stated that Radix "handles role, `aria-modal`, focus trap, restore, and Escape," and the finding above was titled around the absence of `aria-modal="true"`. **Radix does not emit `aria-modal`** — the attribute appears nowhere in `@radix-ui/react-dialog@1.1.23`'s dist. It instead applies `hideOthers` from the `aria-hidden` package, marking every sibling of the portal `aria-hidden="true"`.

That is the **stronger** technique — `aria-modal` has known screen-reader support gaps — and modality is conveyed correctly, confirmed live: outside content measured `aria-hidden="true"` while a dialog was open. But anyone grepping for `aria-modal` to verify this finding will not find it, so the rev. 2 phrasing is retracted. **Do not add `aria-modal` on top of Radix.**

#### What was verified, and what was not

Observed live per modal: `role="dialog"`, accessible name and its computed text, `aria-describedby` present-or-suppressed, `max-w-*`/`max-h-*` geometry, body scroll lock engaging and releasing, Escape, outside-click, and inside-click-does-not-close.

**Rev. 3b — focus restoration is now observed in the real app**, against a full local stack (Vite + Express + Postgres 16), using real mouse clicks and real Escape keypresses rather than a harness. See B-04 below: this found a regression, which is fixed.

**Still not observed:** Tab-cycle containment inside an open dialog. The eval context reports `innerWidth: 0` and synthetic Tab does not move focus, so this remains a Radix guarantee taken on trust.

---

### ✅ B-04 — Focus not restored to trigger on dialog close — **FOUND AND FIXED (rev. 3b)**

| | |
|---|---|
| **WCAG** | 2.4.3 Focus Order (A) |
| **Severity** | Blocker (regression) → closed |
| **Found** | real-app keyboard testing against the local stack |
| **Fixed** | commit `7aa6039`, `frontend/src/src/hooks/useFocusRestore.ts` |

**This was a regression introduced by the Phase 3 migration**, caught only because the modals became reachable once the backend was running locally.

Radix restores focus to `Dialog.Trigger` on close. No modal here uses `Dialog.Trigger` — they are driven by an `isOpen` prop flipped from buttons across [`DashboardPage.tsx:538-670`](../frontend/src/src/pages/DashboardPage.tsx). With no trigger reference, Radix dropped focus onto `<body>`: a keyboard user pressing Escape landed at the top of the document and had to tab back from the start.

Measured before the fix — all three dashboard modals, real click to open, hardware Escape to close:

| Modal | Opens | Focus moves in | Closes | Focus restored |
|---|---|---|---|---|
| ScheduleInput | ✅ | ✅ | ✅ | ❌ `<body>` |
| ConnectAccount | ✅ | ✅ | ✅ | ❌ `<body>` |
| FileImport | ✅ | ✅ | ✅ | ❌ `<body>` |

Note this was **worse than pre-migration for this one axis**: before, focus never moved into the modal, so it stayed on the trigger by default. Everything else about the migration is a net improvement, but this specific behaviour regressed and is why the rev. 2 assumption that "Radix handles focus restore" needed measuring rather than trusting.

**Fix:** `useFocusRestore` captures `document.activeElement` when the dialog opens and restores it via `onCloseAutoFocus`. `Dialog.Trigger` was not an option — `ScheduleInputModal` is opened from both "Add Classes" and "Add Your Schedule", so the restore target is only known at runtime. The capture runs during render rather than in an effect, because React flushes child effects before parent effects: an effect would run after Radix had already moved focus and would capture an element *inside* the dialog.

Verified after the fix across all six trigger paths, including the multi-trigger case — the same modal opened from two different buttons returns to whichever one opened it.

#### 🟡 M-09 — Remaining gap: triggers inside transient popovers `OPEN`

`EditItemModal` still does **not** restore focus. Its "Edit" button lives in a popover that `DashboardPage.tsx:894` tears down in the same handler that opens the modal, so the captured node is detached (`isConnected === false`) by the time the dialog closes, and focusing a detached node is a no-op.

The hook detects this and declines to suppress Radix's default rather than swallowing the event silently, but the end state is still focus on `<body>`. **Fixing this properly requires a change at the `DashboardPage` call site** — either keep the popover mounted, or pass the schedule-item element as an explicit restore target. Any other trigger living in a menu that closes on selection will behave the same way.

**Effort: 1–2 hrs.** Not addressed in rev. 3b.

---

### 🔴 B-03 — 10 icon-only buttons with no accessible name

| | |
|---|---|
| **WCAG** | 4.1.2 Name, Role, Value (A) |
| **Severity** | Blocker |
| **Effort** | 1.5 hrs |

Rev. 2 noted exactly **one** `aria-label` in 6,991 lines (`DashboardPage.tsx:212`). **Rev. 3: now six** — Phase 3 added `aria-label="Close"` to the five modal close buttons.

⚠️ **Scan gap, rev. 3.** The ten below are all *outside* the modals. The six modal `X` close buttons were icon-only and unlabelled in rev. 2 and this finding **missed them entirely** — they were fixed incidentally by Phase 3 rather than by this audit. A re-scan also surfaces further unlabelled icon-only buttons inside the modals (e.g. the password `Eye` toggles in `ConnectAccountModal`, the edit/delete controls in `FileImportModal`) that are not in this list. **The list below is not exhaustive and the count of 10 is a floor, not a total.** A dedicated icon-button sweep should replace it before Phase 2 is called done.

These ten announce as "button":

| File:line | Icon | Function |
|---|---|---|
| `components/PomodoroTimer.tsx:251` | `Square` | Stop timer |
| `components/PomodoroTimer.tsx:255` | `Pause`/`Play` | Play/pause — **also a state toggle, needs `aria-pressed`** |
| `components/PomodoroTimer.tsx:260` | `SkipForward` | Skip phase |
| `pages/DashboardPage.tsx:443` | `Plus` | Add todo |
| `pages/TodayPage.tsx:533` | `Plus` | Add todo |
| `pages/GradesPage.tsx:796` | `LogOut` | **Log out — destructive** |
| `pages/GradesPage.tsx:813` | `RefreshCw` | Refresh grades |
| `pages/TodayPage.tsx:653` | `RefreshCw` | Refresh |
| `pages/LoginPage.tsx` (toggle) | `Eye` | Show/hide password |
| `pages/SignupPage.tsx` (toggle) | `Eye` | Show/hide password |

An unlabeled **log out** button is the worst of these — a destructive action a screen reader user may trigger blind.

---

### 🟠 S-01 — Decorative SVG icons not hidden from assistive tech

| | |
|---|---|
| **WCAG** | 1.1.1 Non-text Content (A) |
| **Severity** | Serious |
| **Effort** | 1.5 hrs |

No Lucide icon anywhere carries `aria-hidden="true"`. Icons inside buttons that already have visible text produce duplicate announcements.

**There are zero `<img>` elements in the codebase** — the "missing alt text" category from the brief resolves entirely to this SVG issue.

---

### 🟠 S-02 — Inconsistent focus indicators on 71 raw `<button>` elements

| | |
|---|---|
| **WCAG** | 2.4.7 Focus Visible (AA) |
| **Severity** | Serious |
| **Effort** | 2 hrs |

`components/ui/button.tsx:7` correctly applies `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`. Every `<Button>` inherits it.

But **71 raw `<button>` elements bypass that component**, and only 1 has any focus class:

| File | Raw `<button>` count |
|---|---|
| `pages/DashboardPage.tsx` | 13 |
| `pages/TodayPage.tsx` | 11 |
| `components/PomodoroTimer.tsx` | 7 |
| `components/ScheduleInputModal.tsx` | 6 |
| `components/PreferencesModal.tsx` | 6 |
| `pages/GradesPage.tsx` | 4 |
| `components/MusicPlayer.tsx` | 4 |
| `components/FileImportModal.tsx` | 4 |
| `components/ConnectAccountModal.tsx` | 4 |
| others | 12 |

**Nuance — not a strict failure.** There is no global `*:focus { outline: none }` reset, so these still get the browser default ring and remain technically compliant. The problem is inconsistency: half the UI shows a branded orange ring, half shows the UA default. **Verify manually** before treating as confirmed.

---

### 🟠 S-03 — `--ring` focus colour never verified against custom-coloured surfaces

| | |
|---|---|
| **WCAG** | 1.4.11 Non-text Contrast (AA) |
| **Severity** | Serious |
| **Effort** | 1 hr |

`--ring: 25 95% 40%` = `#C75605`. Against the page background it measures **4.21:1** ✅.

But `PomodoroTimer.tsx:257` and `PlanBlock.tsx` set `backgroundColor` from runtime values. A `#C75605` ring on the orange focus-phase button (`#f97316`) measures **1.58:1** ❌. Standard `<Button>`s escape this via `ring-offset-2`; raw buttons with inline background colours do not.

---

### ✅ S-10 — User-facing errors exposed internal diagnostics — **FIXED (rev. 4)**

| | |
|---|---|
| **WCAG** | 3.3.1 Error Identification (A) · 3.3.3 Error Suggestion (AA) |
| **Severity** | ~~Serious~~ → closed |
| **Found** | live, on `/today` |
| **Landed** | commit `653b5b2` |

Rev. 2 listed error states as "not verified — would require submitting invalid data against live auth." Running the app locally surfaced one without any invalid input at all: `/today` rendered this to the user, in the error banner, as the page's primary content:

> "Could not resolve authentication method. Expected either apiKey or authToken to be set. Or for one of the "X-Api-Key" or "Authorization" headers to be explicitly omitted"

That is the Anthropic SDK reporting a **server** misconfiguration, shown verbatim to a student.

**Cause:** 11 sites across 4 route files did `res.status(...).json({ error: err.message })`. Other messages reachable by the same path included `"RESEND_API_KEY is not configured"`, `"SOAP request failed: 500 …"`, and `` `No JSON in AI response. Got: ${jsonStr.slice(0,200)}` `` — the last echoing 200 characters of raw model output back to the browser.

Against the audit's own formula (*what + why + what to do*) these score zero on all three: they name an internal component, give a cause the user cannot act on, and suggest nothing.

**Fix:** a `UserFacingError` type marks messages deliberately written for users; `toClientError()` forwards only those and substitutes caller-supplied copy for everything else, logging the real message and stack server-side. The two genuinely user-facing multer strings ("File too large. Maximum size is 20 MB." / "Too many files…") were preserved. In the scraper routes the scrubbed text is also what `failJob()` persists, since the client reads that back to render the job banner.

**Verified:** `GET /api/planner/today` with no API key now returns *"We couldn't build today's plan just now. Try again in a moment."* with zero internal strings in the payload, while the full SDK message and stack appear in the log.

**Note on severity:** this is filed as an accessibility finding because 3.3.1/3.3.3 govern whether an error is *identified in text the user can act on*. It is simultaneously an information-disclosure issue — see the appendix.

---

## 📄 `/dashboard` — `pages/DashboardPage.tsx` (938 lines)

Has a `<main>` landmark ✅ and a single `<h1>` ✅.

Inherits **B-01**, **B-03**, **S-01**, **S-02**. *(B-02 closed in Phase 3.)*

### 🟡 M-01 — Todo input labelled only by a changing placeholder

| | |
|---|---|
| **WCAG** | 3.3.2 Labels or Instructions (A) |
| **Severity** | Moderate |
| **Effort** | 20 min |
| **Location** | `pages/DashboardPage.tsx:441` |

```jsx
<Input value={todoInput} … placeholder={todoDragOver ? "Drop to add task…" : "Add a task…"} />
```

The accessible name comes from `placeholder` only — and it **changes during drag**, so the name mutates under the user. Placeholders also vanish on input.

**Fix:** add a visually-hidden `<label>`; keep the placeholder as a hint.

---

### 🟡 M-02 — Drag-and-drop todo reordering has no keyboard equivalent

| | |
|---|---|
| **WCAG** | 2.1.1 Keyboard (A) |
| **Severity** | Moderate — **UNVERIFIED** |
| **Effort** | 4–6 hrs |
| **Location** | `pages/DashboardPage.tsx:~435` (`todoDragOver`), `pages/TodayPage.tsx:~520` (`isDragOver`) |

Both pages implement drop targets. I found no corresponding keyboard affordance, but I did not trace every handler — flagged for confirmation rather than asserted. If drag is the only way to perform an action, that action is keyboard-inaccessible.

---

## 📄 `/today` — `pages/TodayPage.tsx` (925 lines)

Has `<main>` ✅.

Inherits **B-01**, **B-03**, **S-01**, **S-02**, **M-01** (`:527`), **M-02**. *(B-02 closed in Phase 3.)*

### ✅ S-04 — No `<h1>`; heading hierarchy starts at `<h3>` — **FIXED (rev. 4)**

| | |
|---|---|
| **WCAG** | 1.3.1 Info and Relationships (A) |
| **Severity** | ~~Serious~~ → closed |
| **Effort** | 30 min estimated · spent |
| **Location** | `pages/TodayPage.tsx` |
| **Landed** | commit `e2ca657` |

Was: no `<h1>` anywhere, with `h3`s (:130, :417, :460, :508) preceding `h2`s (:624, :713), so heading navigation was both rootless and out of order.

**Worse than rev. 2 recorded.** The visually dominant element — the greeting, styled `text-xl sm:text-2xl font-display font-bold` — is a `<p>`, *and* it renders only when `isToday`. On any other date the page had no title at all, visually or semantically. Rev. 2's suggested fix ("add an `<h1>` for the page") would have produced a heading that disappears when you page to tomorrow.

**Fix as landed:** the **date** is the `h1`. It is always rendered and it identifies which day is shown; the greeting stays a decorative `<p>`. Section headings moved `h3` → `h2` so they nest under it. Visual weight and semantic level deliberately differ here — the greeting is larger but is not the page's identity.

Now: `h1` "Tuesday, July 28" (:635), then `h2` × 5 (:130, :417, :460, :508, :725). One `h1`, no skipped levels.

**Verified live**, not from source: `document.querySelectorAll('h1').length` → **1**, where rev. 2 measured 0.

Also fixed alongside: the previous/next-day arrow buttons were icon-only with no accessible name (B-03 class) and now carry `aria-label="Previous day"` / `"Next day"`; the nav tabs carry `aria-current="page"`.

---

## 📄 Grades view — `pages/GradesPage.tsx` (965 lines)

The worst-affected file. Has `<main>` ✅ and one `<h1>` ✅.

Inherits **B-01** (6 of the 12 unassociated labels), **B-03**, **S-01**, **S-02**. *(B-02 closed in Phase 3.)*

### 🟠 S-05 — Non-semantic clickable div (expand/collapse control)

| | |
|---|---|
| **WCAG** | 2.1.1 Keyboard (A) · 4.1.2 Name, Role, Value (A) |
| **Severity** | Serious |
| **Effort** | 45 min |
| **Location** | `pages/GradesPage.tsx:467` |

```jsx
<div className="p-5 cursor-pointer select-none" onClick={() => setExpanded((e) => !e)}>
```

No `role`, no `tabIndex`, no key handler, no `aria-expanded`. **Not reachable or operable by keyboard** — a keyboard user cannot expand a course to see its grades.

**Fix:** `<button type="button" aria-expanded={expanded} aria-controls="…">`.

#### ⚠️ Correction to rev. 2: it was not the only one

Rev. 2 asserted this was "the only genuine non-semantic clickable in the codebase." **That was wrong.** `DashboardPage`'s `ScheduleBlock` was also a `<div onClick>` with no `role`, `tabIndex`, or key handler — meaning opening a class to edit it, *the primary interaction on the main screen*, was mouse-only. The scan that produced rev. 2 missed it.

It was worse than this one on two counts: it sits on a page users see every session rather than a route that did not exist, and there were 5–7 instances rendered at once rather than one.

Converted to `<button type="button">` in `0f2c3f5` (it surfaced because the depth work needed a focus state to attach to, not because a scan caught it). **S-05 itself remains open** — and is now genuinely reachable, since `/grades` was routed in rev. 4.

The rev. 2 phrasing is retracted: treat "only instance" claims in this document as unverified unless a scan is shown.

---

### 🟠 S-06 — Inline grade editors unlabelled and mouse-dependent

| | |
|---|---|
| **WCAG** | 4.1.2 (A) · 3.3.2 (A) |
| **Severity** | Serious |
| **Effort** | 1.5 hrs |
| **Location** | `pages/GradesPage.tsx:269, 276` |

Two `<input type="number">` score editors with no label, no `aria-label`, and no placeholder — **zero accessible name**. Rendered inside `<span onClick={e => e.stopPropagation()}>` (`:268`), reached by clicking the score.

Escape/Enter are handled (`:270`) ✅, but a screen reader user has no way to know what either field represents. With two adjacent number fields (score, max score), they're indistinguishable.

**Fix:** `aria-label={`Score for ${grade.title}`}` and `aria-label="Maximum score"`.

---

## 🧩 Shared components

### 🟠 S-07 — Pomodoro timer: white text on runtime colours fails contrast

| | |
|---|---|
| **WCAG** | 1.4.3 Contrast (Minimum) (AA) |
| **Severity** | Serious |
| **Effort** | 45 min |
| **Location** | `components/PomodoroTimer.tsx:257`, palette at `:20-24` |

`style={{ backgroundColor: color, color: "#fff" }}` — white on each phase colour:

| Phase | Colour | White text | |
|---|---|---|---|
| `focus` | `#f97316` | **2.80** | ❌ |
| `short_break` | `#22c55e` | **2.28** | ❌ |
| `long_break` | `#38bdf8` | **2.14** | ❌ |

All three fail, and all fail the 3:1 large-text floor too.

The same palette used as *text on the dark card* is fine (6.63–8.67 ✅) — the failure is specific to white-on-colour fills.

**Fix:** use a dark foreground (`#111318`) on these fills, mirroring the Phase 1 `--primary-foreground` change.

---

### 🟡 M-03 — Schedule category colours: 5 of 7 fail contrast

| | |
|---|---|
| **WCAG** | 1.4.3 Contrast (Minimum) (AA) |
| **Severity** | Moderate |
| **Effort** | 1 hr |
| **Location** | `components/ScheduleInputModal.tsx:25-33`, applied at `:125-127` |

Chips render as `color` on `${color}25` (≈14.5% alpha) over the dark card:

| Category | Colour | Ratio | |
|---|---|---|---|
| `assignment` | `#f59e0b` | 6.79 | ✅ |
| `activity` | `#10b981` | 5.91 | ✅ |
| `exam` | `#ef4444` | **4.29** | ❌ |
| `study` | `#3b82f6` | **4.27** | ❌ |
| `project` | `#8b5cf6` | **3.79** | ❌ |
| `class` | `#6366f1` | **3.60** | ❌ |
| `other` | `#6b7280` | **3.34** | ❌ |

**Note the contrast with B-03-retracted:** the landing page's decorative chips use `/15` alpha with *Tailwind 400-level* text and pass comfortably. These use *500-level* colours as their own text at `/25`, which is darker text on a lighter tint — hence the failures. Lighten the text to the 400 level to match the landing page pattern.

---

### ✅ M-04 — Onboarding modal cannot be dismissed by keyboard — **CLOSED as intended behaviour**

| | |
|---|---|
| **WCAG** | 2.1.2 No Keyboard Trap (A) |
| **Severity** | ~~Moderate — INFERRED~~ → not a defect |
| **Effort** | — |
| **Location** | `components/OnboardingModal.tsx:396`, props at `:29-31` |

**Resolved by product decision, not by code.** Confirmed with the owner on 2026-07-27: onboarding is **deliberately non-dismissible**. Users must not be able to bypass it.

The rev. 2 write-up treated the missing Escape handler as an oversight. It was not. The pre-migration component had no `onClose` prop, no close button, no overlay handler, and no Escape listener — there was no close path for an Escape handler to call. The "Skip for now" button (`:201`) calls `next()` to *advance* the flow, not exit it.

**Phase 3 preserved this exactly:** `open` is a constant, there is no `onOpenChange`, and `onEscapeKeyDown` / `onPointerDownOutside` / `onInteractOutside` all `preventDefault()`. Verified live — neither Escape nor an outside click dismisses it.

**Not a 2.1.2 failure.** 2.1.2 prohibits trapping focus with *no* way out; the flow has a keyboard-operable exit at every step (Get started → Skip → …→ onComplete). The rev. 2 concern was that this compounded with the missing focus trap in B-02 — B-02 is now fixed, so that compounding is gone.

⚠️ **Do not "fix" this.** It reads like an a11y gap and is an easy accidental regression. If it must become dismissible, that is a product decision requiring owner sign-off.

The one genuine gap that remains: the modal now has a VisuallyHidden title ("Getting started") rather than a per-step accessible name, so a screen reader user re-querying the dialog title mid-flow hears a generic label rather than the current step. Low impact — each step has its own visible heading — but noted.

---

### 🟡 M-05 — Category conveyed by colour alone

| | |
|---|---|
| **WCAG** | 1.4.1 Use of Color (A) |
| **Severity** | Moderate |
| **Effort** | 1.5 hrs |
| **Location** | `components/ScheduleInputModal.tsx:25`, `components/PlanBlock.tsx` |

Schedule category is communicated purely by colour. Deuteranopia collapses `class` (`#6366f1`) against `project` (`#8b5cf6`), and `activity` (`#10b981`) against `study` (`#3b82f6`).

**Fix:** add an icon or text prefix per category.

---

### 🟡 M-06 — Hidden file input unlabelled

| | |
|---|---|
| **WCAG** | 4.1.2 (A) |
| **Severity** | Moderate |
| **Effort** | 20 min |
| **Location** | `components/FileImportModal.tsx:424` |

`<input type="file" className="hidden">` triggered by a "Browse Files" button. `className="hidden"` (`display:none`) does remove it from the accessibility tree, so impact is limited — but the visible trigger is a `<Button>` with `pointer-events-none` (`:421`), meaning the actual control relationship is opaque. Verify the trigger is keyboard-operable.

---

## 📄 `/`, `/login`, `/signup` — status after Phase 1

### ✅ FIXED — contrast findings from rev. 1

| Was | Before | After | Fix |
|---|---|---|---|
| Primary button text | 2.79 | **6.67** ✅ | `--primary-foreground: 220 16% 8%` |
| Muted body text | 4.37 | **5.95** ✅ | `--muted-foreground: 220 12% 59%` |
| Placeholder text | 4.17 | **5.69** ✅ | same token |

Re-measured on the running dev build: **0 contrast failures** on all three pages.

### ❌ RETRACTED — B-03 (rev. 1), schedule chip contrast

Originally logged as a Blocker at 1.39–2.39:1. **False positive.** All 12 chips measure 5.46–9.20:1.

**Cause:** the chips use `bg-primary/15` etc. — alpha over a dark page. My first measurement pass fell back to compositing against **white** when it couldn't resolve an opaque ancestor, inventing light backgrounds (`#FEEADC`, `#DEF6E7`) that don't exist. Verified against `pages/LandingPage.tsx:114-158`.

Retained here deliberately so the error is on record rather than quietly deleted.

### Still open on these pages

**S-08 — No `<main>` landmark** · 1.3.1 (A) · Serious · 30 min
`LandingPage.tsx`, `LoginPage.tsx`, `SignupPage.tsx`, `components/AuthLayout.tsx` — all lack `<main>`. The three authenticated pages have one; the public pages don't.

**S-09 — No skip link** · 2.4.1 Bypass Blocks (A) · Serious · 45 min
No skip mechanism anywhere. Pairs with S-08.

**M-07 — Password rules only in placeholder** · 3.3.2 (A) · Moderate · 45 min
`pages/SignupPage.tsx` — "Min 8 characters" lives only in the placeholder, which disappears on typing.

**M-08 — Terms checkbox lacks explicit association** · 1.3.1 (A) · Moderate · 15 min
`pages/SignupPage.tsx:133` — no `id`; works via implicit wrapping `<label>` (`:132`), which is fragile. The label also contains Terms/Privacy links, so clicking a link may toggle the checkbox.

*(Login/signup `<h1>` comes from `components/AuthLayout.tsx:30` — correct, single, present.)*

---

## Remediation plan

| Phase | Work | Effort | Fixes |
|---|---|---|---|
| ~~1~~ | ~~Design tokens~~ ✅ **DONE** | — | Contrast on 3 public pages |
| **2** | Accessible names: `htmlFor`/`id` pairs, `aria-label` on 10 icon buttons, `aria-hidden` on decorative SVGs | 7 hrs | B-01, B-03, S-01 |
| ~~3~~ | ~~Modal overhaul — migrate 6 modals to `@radix-ui/react-dialog`~~ ✅ **DONE** (dependency had to be installed; see correction above) | — | B-02, M-04 |
| **4** | Semantics — `<main>`, skip link, `GradesPage:467` div→button | 2.5 hrs | S-05, S-08, S-09 *(TodayPage `<h1>` done — S-04)* |
| **5** | Remaining colour — Pomodoro fills, category palette, non-colour indicators | 3.5 hrs | S-07, M-03, M-05 |
| **6** | Focus consistency + keyboard DnD alternative | 6 hrs | S-02, S-03, M-02 |

**Phase 2 is the priority** — it unblocks the core grade-entry and scheduling workflows for screen reader users.

---

## Appendix: false positives excluded

Recorded so they aren't re-reported, and because one of them was a genuine error in rev. 1.

| Candidate | Why excluded |
|---|---|
| `components/ui/input.tsx:10` | Base component; forwards `...props` including `id`. Callers supply it. |
| `pages/SignupPage.tsx:133` | Wrapped in implicit `<label>` (`:132`) — resolves a name. Logged separately as M-08 for fragility, not as missing. |
| `pages/GradesPage.tsx:674` | Wrapped in `<label>`. |
| `pages/GradesPage.tsx:268` | `<span onClick>` is `stopPropagation()` only — an event guard, not a control. |
| Landing page "clickable divs" ×2 | Inside the logo `<a>`, inheriting `cursor:pointer`. |
| `Loader2` icon buttons ×5 (`LoginPage:116`, `SignupPage:151`, `ScheduleInputModal:185,445`, `ConnectAccountModal:313`) | Conditional loading branches; buttons have text in the default state. |
| Landing chip contrast (rev. 1 B-03) | Alpha-compositing bug. See retraction above. |
| Input text contrast (rev. 1 draft) | Same bug, caught before publication. |

---

## Appendix: non-accessibility defects found while deploying locally

Out of scope for this audit, recorded because they block standing the app up from a clean checkout and were found the hard way.

### 🔴 Migration is missing `schedule_items.estimated_minutes`

`backend/src/src/migrations/run.ts` never creates the column, but `createScheduleItem` in `backend/src/src/models/schedule.ts:40` inserts into it. **Any database built from `run.ts` returns a 500 on every schedule-item creation** — the core write path. The deployed database presumably had the column added out of band.

```
error: column "estimated_minutes" of relation "schedule_items" does not exist
    at createScheduleItem (backend/src/src/models/schedule.ts:40)
```

`backend/src/src/migrations/run.ts.patch` exists but contains only the stub text `-- patch --`, which suggests this was known and never finished.

**Worked around locally** with `ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER;` — applied only to the throwaway local database, **not** to `run.ts`. The real fix belongs in the migration and has not been made.

### 🔴 Ten environment variables the code reads but `.env.example` never documented

Found while diagnosing S-10. `backend/src/.env.example` declared 9 variables; the code reads 10 more that it never mentioned:

`ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `ION_CLIENT_ID`, `ION_CLIENT_SECRET`, `CRON_SECRET`, `SERVE_STATIC`

**`ANTHROPIC_API_KEY` is the dangerous one.** It is read *implicitly* by `new Anthropic()` and appears nowhere in our source by name, so grepping the codebase does not reveal it. Its absence takes out daily-plan generation, schedule parsing and file import — and, before S-10 was fixed, surfaced as SDK jargon in the UI with no indication that a missing env var was the cause. A fresh clone could not run the app and had no way to discover why.

All ten are now documented with their purpose and consequence-if-missing. Fixed in `653b5b2`.

### 🟡 Information disclosure via error responses

The same defect as S-10, viewed as a security issue rather than a usability one. Before the fix, unauthenticated-reachable endpoints could return `"RESEND_API_KEY is not configured"` (confirms which services are wired), `"SOAP request failed: 500 …"` (upstream topology), and up to 200 characters of raw model output. The last is the notable one: if untrusted content ever reaches the model, its output was being reflected back to the client verbatim. Fixed in `653b5b2`.

### 🟡 `frontend/src/.env.example` points `VITE_API_URL` at a placeholder

`VITE_API_URL=https://your-backend.vercel.app`. Copying the example verbatim silently sends every API call to a non-existent host. For local work the value must be **empty** so the Vite dev proxy (`vite.config.ts` → `localhost:4000`) takes over — which the comment above it says, while the value contradicts it. Suggest defaulting the value to empty.

---

## Method notes

- Form-control and icon-button scans use **multi-line JSX parsing**. A single-line grep initially reported "only 4 of 53 controls have an `id`" — wrong, because `id=` sits on the line after `<Input`. The correct figure is 31. Single-line greps are unsafe on this codebase.
- **Rev. 3 — naive tag-end detection is also unsafe.** Finding a tag's end with the next `>` truncates any tag containing an arrow function: `onChange={(e) => …}` ends the tag early, hiding every attribute after it. That is what produced the retracted `ScheduleInputModal` textarea finding — its `placeholder` sits after an `onChange`. Correct approach: scan forward tracking `{}` depth and string state, and only accept a `>` at depth 0. Two further blind spots to watch: the scan must match the capitalised `<Input>` / `<Label>` wrapper components as well as lowercase `<input>` (this is why `GradesPage.tsx:429` was nearly dropped), and it must detect **implicit `<label>` wrapping** or it will re-report the known false positive at `GradesPage.tsx:674`.
- **Rev. 4 — source presence is not coverage.** `GradesPage` was audited from source in rev. 2 and ranked the worst-affected file without anyone checking that it had a route. It had none. Before ranking a file by finding count, confirm a user can reach it: grep the router for the component, not just the filesystem for the file.
- **Rev. 4 — "only instance" claims need a shown scan.** Two such claims in rev. 2 turned out false (the non-semantic clickable in S-05; `aria-label` counts in B-01). Both came from scans whose output was never recorded, so neither could be re-checked.
- **Rev. 3 — the JS eval context reports `innerWidth: 0`**, so `getBoundingClientRect()` and viewport-relative maths are meaningless there. Computed styles (`max-width`, `overflow`, `position`) are reliable; geometry must be read from screenshots. An early Phase 3 measurement showed a dialog as `2px` wide and off-screen purely from this.
- Contrast computed per WCAG relative luminance with alpha compositing resolved up the ancestor chain against the real page background (`rgb(8,10,12)`), not a white fallback.
- Large-text threshold: ≥24px, or ≥18.66px at weight ≥700 → 3:1.
- Implicit `<label>` wrapping checked by walking back up to 12 lines for an unclosed `<label>`.
- Post-Phase-1 figures measured against the running Vite dev server, not the deployed build (production still serves the pre-fix bundle).

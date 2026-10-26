# Design gaps

Places where the builtbyjosef design system (copied into `src/design/`, commit in `src/design/VERSION`) did not have what the app needed, and the nearest tokens used instead. The design system repository was not changed.

| # | Needed | Used instead | Note for the design system |
| --- | --- | --- | --- |
| G1 | Navigation bar and tab component | Links styled in `src/styles.css` (`.top nav`, `.tabs`) with `--ink-muted`, `--ink`, `--border-strong`, `--hit-min` | Add a `jy-nav` / `jy-tabs` component. |
| G2 | Segmented choice (status, attendance present/absent, role, upload type) | Native radio inputs styled as buttons (`.choice`) using `--surface-raised`, `--line-strong`, `--inverse`, `--radius-md` | Add a `jy-segmented` component. |
| G3 | Active indicator for nav and tabs | 2px `--ink` underline, not orange | DESIGN.md allows "the active cap" as heat, but with an accent button on the same view that makes two orange points; ink keeps the one-point rule. |
| G4 | Textarea, select, checkbox, file input | `jy-field__input` on `<textarea>` and `<select>`; checkboxes use `accent-color: var(--ink)` | Add textarea/select/checkbox variants to `jy-field`. |
| G5 | Notice / alert banner | `.notice`: a bordered row with a `jy-badge` (shape + word) and a sentence | Add `jy-notice`. |
| G6 | Progress bar | `.progress`: `--surface-sunken` track, `--ink` fill, `--radius-xs` | Add `jy-progress`. The orange `jy-heat` ramp is for heat maps, so it was not used. |
| G7 | Editable code block | `jy-code` with a `<textarea>` inside (`.code-input`) using `--font-mono`, `--surface-sunken` | `jy-code` is display-only. |
| G8 | Spacing utilities | `.mt-*`, `.mb-*` classes mapped to `--space-*` tokens | Optional. |
| G9 | Neutral badge for "In progress", "Not started", "Current" | `jy-badge` with no modifier (grey circle) | Fine as is; documented here so nobody adds a colour. |
| G10 | Summary numbers (students, help waiting, projects done) | Plain sentences in a panel, not `jy-stat` | Each `jy-stat` carries an orange cap, so a row of stats breaks the one-orange-point rule. The checker flagged this; stats were removed. A capless stat variant would help. |
| G11 | Row actions in lists (Approve, Send answer, Run) | Full-size ghost buttons (`jy-btn--ghost`, 44px); `jy-btn--s` (32px) is not used because it is below the 44px touch target | A primary `jy-btn` has an orange cap; many in one list would break the one-point rule. Each view keeps at most one primary or accent button. |
| G12 | App icon / favicon | None (`<link rel="icon" href="data:,">`) | The brief forbids the builtbyjosef logo outside the Settings credit, and the program has no logo of its own yet. |

Not used on purpose: `ignite.css` (hero, flare, burn bar, stair) and `jy.js`. DESIGN.md's app recipe is "calm, no flare", and the only motion the app needs (hover, press) is already in `bundle.css`. Reduced motion is honoured by `bundle.css`.

The builtbyjosef logo appears in exactly one place: the credit at the bottom of Settings (`tab-primary-light.svg` / `tab-primary-dark.svg`, 32px tall, above the 24px minimum), with the text "Designed and built by Josef Yang". The end-to-end test "the builtbyjosef logo appears only in the Settings credit" checks this.

`scripts/jy-check.sh` (from the design system) only scans CSS and HTML files, so `scripts/check-templates.js` applies the same checks (plus emoji, inline pixel styles and small buttons) to the lit-html templates in `src/**/*.js`. `npm run design:check` runs both.

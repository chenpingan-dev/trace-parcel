# Trace Parcel design contract

The primary task is a handoff: choose evidence, review processing, export a report. Preserve that sequence. Avoid turning this into an API client, a metrics dashboard or a marketing landing page.

- Microsoft YaHei first, with system fallbacks; primary request text at least 14px and body text around 14–15px on desktop
- Graphite text on white or pale neutral surfaces; secondary text remains readable, never a page of faint lavender microtype
- Violet reserved for primary actions, selected requests, timing visualization and small identity details
- Phosphor duotone icons, embedded locally; retain their MIT notice. No improvised Unicode icons for product controls
- Request table and inspector on the left, a document-like report sheet and privacy controls on the right
- Report sheet has its own hierarchy, binding accent, restrained paper edge and clear title. No fake KPI cards
- Desktop/tablet/mobile must fit without horizontal page overflow; long URLs and headers wrap or truncate with full details available
- Show only processed content by default. Original is an explicit, labeled local view
- All visible controls use natural bilingual copy. Chinese UI labels and short descriptions omit final periods
- The export dialog is a snapshot of exactly what will be downloaded. Retain focus behavior and keyboard access
- The built-in checkout recording must remain clearly labeled synthetic. Never include captured traffic or company information
- Inspect desktop and mobile screenshots in both languages before publishing visual changes

The first visual draft was rejected for tiny fonts, low contrast and basic icons. Do not reintroduce those choices.

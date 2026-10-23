# My Diary

A static personal journal with browser-side vault encryption, Supabase Auth, and PostgreSQL Row Level Security. Entries are stored in Supabase, not this repository. The configured publishable key is intended for browser use.

## Run locally

Run `python3 -m http.server 8765 --bind 127.0.0.1` and open http://127.0.0.1:8765.

## Supabase

For a new project, run `supabase/schema.sql` followed by `supabase/002-encrypted-vault.sql` and set its URL and publishable key in `config.js`. Enable email/password authentication and email confirmation. Set Authentication → URL Configuration → Site URL to the published website URL and add that URL to the redirect allowlist. Keep localhost as an additional redirect URL for local use.

Create an account and confirm your email, then return to sign in. Choose a separate vault passphrase and save the recovery key to enable encryption. Existing deployments must apply `supabase/002-encrypted-vault.sql` before using this version. For a personal project, disable sign-ups after creating the desired accounts. Password recovery UI is not yet implemented.

Use Export JSON in your original browser diary, then Import / Restore after signing into the hosted diary to transfer existing writing. No automatic upload of browser entries occurs.

## Saving

Cloud entries and sign-in sessions stay in tab memory; refreshing requires signing in again. Saves are debounced and serialized. Conflicting saves from another session are rejected: export unsaved writing, reload, sign in, and import to reconcile. Export before closing if saving fails. Cloud saves and default JSON backups are encrypted in the browser. Markdown exports and old backups are unencrypted. See [ENCRYPTION.md](ENCRYPTION.md) for recovery, migration, and the security model.

The private Storage bucket is reserved for future attachments. School schedules are static public pages. The vendor directory contains the bundled Supabase JS SDK and license. Keep all assets together. When changing Supabase projects, update the `connect-src` origin in the Content Security Policy in `index.html` as well as `config.js`.

## Checks

`npm ci`, then `npm test` and `npm run test:browser`. Browser tests use Chromium (`CHROMIUM_PATH` can override its location).

## GitHub Pages

Publish the `main` branch from the repository root. `.nojekyll` ensures static files are served directly. Journal backups and local backup folders must never be committed.

On phones, tap **☰ Entries** to browse earlier writing. Theme, schedules, account actions, and exports are under **Settings & backups** in the library.

Themes: **Warm**, **Cool**, **Dark**, **Aurora · Futuristic**, and **Parchment · Rustic**. Choose a theme under Settings & backups; it is remembered by this browser and shared with School schedules. New themes use local font and texture assets in `assets/` (font licenses included). Keep `themes.js`, `themes.css`, and `assets/` with the site.

The Parchment theme briefly unfurls like a scroll when selected or when the diary is unlocked, then reveals the writing. Ordinary edits and entry switching do not replay it. Typing or clicking the editor skips the effect; reduced-motion preferences show the page immediately. Parchment layers tea stains, foxing, and paper fibres under a breathing candlelight glow; Aurora adds a starfield with drifting ribbons of spectral light. All ambient animation is disabled when reduced motion is preferred.

## Reminders

Use **Reminders** in the top bar to add a title and calendar date. Due and overdue reminders open automatically after unlocking (or opening the local diary). Closing the popup keeps them pending; **Mark done** deletes a finished reminder for good, and **Edit / reschedule** changes the title or date. The app also checks for a new local calendar day while it stays open. There are no notifications outside the diary and no notification permission is needed.

In cloud mode, reminder titles and dates are encrypted with the journal and included in encrypted JSON backups. Import merges reminders by ID using the selected conflict policy, and completed reminders in older backups are dropped on import rather than restored. Markdown export includes journal entries only. Local mode stores reminders unencrypted with its existing browser data.

No additional SQL migration is required. The inner journal format is now version 2 (`entries` and `reminders`); old version 1 backups still import. Refresh all diary tabs after updating: older app versions cannot read the new inner format. Existing revision conflict checks prevent stale tabs from overwriting newer saves.

# My Diary

A static personal journal using Supabase Auth and PostgreSQL Row Level Security. Entries are stored in Supabase, not this repository. The configured publishable key is intended for browser use.

## Run locally

Run `python3 -m http.server 8765 --bind 127.0.0.1` and open http://127.0.0.1:8765.

## Supabase

For a new project, run `supabase/schema.sql` once and set its URL and publishable key in `config.js`. Enable email/password authentication and email confirmation. Set Authentication → URL Configuration → Site URL to the published website URL and add that URL to the redirect allowlist. Keep localhost as an additional redirect URL for local use.

Create an account and confirm your email, then return to sign in. For a personal project, disable sign-ups after creating the desired accounts. Password recovery UI is not yet implemented.

Use Export JSON in your original browser diary, then Import / Restore after signing into the hosted diary to transfer existing writing. No automatic upload of browser entries occurs.

## Saving

Cloud entries and sign-in sessions stay in tab memory; refreshing requires signing in again. Saves are debounced and serialized. Conflicting saves from another session are rejected: export unsaved writing, reload, sign in, and import to reconcile. Export before closing if saving fails. Backups are plain text; RLS is access control, not end-to-end encryption.

The private Storage bucket is reserved for future attachments. School schedules are static public pages. The vendor directory contains the bundled Supabase JS SDK and license. Keep all assets together.

## Checks

`node --test core.test.cjs cloud.test.cjs`

## GitHub Pages

Publish the `main` branch from the repository root. `.nojekyll` ensures static files are served directly. Journal backups and local backup folders must never be committed.

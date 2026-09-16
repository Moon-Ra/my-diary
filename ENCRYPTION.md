# Diary encryption

Cloud mode encrypts the complete journal in the browser before upload. Supabase receives ciphertext and wrapped keys. The vault passphrase and recovery key are never submitted to Supabase. Account authentication still sends the separate account password to Supabase over HTTPS.

## User flow

1. Sign in using your existing email and account password.
2. On first use, choose a **different** vault passphrase (at least 12 characters; a long, unique phrase is preferable).
3. Save the recovery key in a password manager or another safe place. Confirm its last eight characters to proceed.
4. The browser encrypts and verifies all existing entries, including Trash. A single database transaction saves the vault, deletes your live legacy plaintext rows, and advances the journal revision. Failed transactions preserve the original rows.
5. Subsequent sessions require account sign-in and the vault passphrase. **Lock diary** saves pending work, clears journal fields and in-memory references, and returns to vault unlock. Unsaved/conflicting sessions cannot silently lock or sign out; export an encrypted backup first.
6. **Use recovery key** lets you choose a new vault passphrase while signed into your account. Your recovery key stays the same. Account password recovery and vault recovery are separate operations; an account password reset does not decrypt the journal.

If both the vault passphrase and recovery key are lost, neither the app nor a database administrator can recover the vault. Store an encrypted backup and recovery key in separate safe places.

## Cryptographic format (version 2)

- Standard browser Web Crypto APIs; no custom cipher or remote encryption service.
- A cryptographically random 256-bit data key encrypts the journal with AES-256-GCM.
- Every encryption uses a fresh random 96-bit IV and a 128-bit authentication tag.
- The vault passphrase derives a wrapping key using PBKDF2-HMAC-SHA-256, 600,000 iterations, and a random 128-bit salt. Parameters are versioned and strictly validated before expensive derivation.
- A separate random 256-bit recovery key wraps the same data key. The recovery key is displayed as 64 hexadecimal characters, grouped for readability.
- AES-GCM additional authenticated data binds each operation to `my-diary:v2:<owner UUID>:<purpose>`. The distinct purposes are `passphrase`, `recovery`, and `journal`.
- The data key is wrapped twice: once with the passphrase-derived key and once with the recovery key. Only the wrapped forms are stored. Runtime AES keys are non-extractable Web Crypto keys.
- The encrypted journal contains a version 2 inner document with `entries` and `reminders`. Entry IDs, titles, bodies, tags, dates, moods, modification dates, and Trash state are encrypted, as are reminder IDs, titles, dates, completion flags, and modification dates. The entire snapshot is authenticated and validated before it is shown. Legacy version 1 inner envelopes remain readable; the outer encrypted format and cryptography are unchanged. Older app versions reject the new inner document rather than silently dropping reminders.
- Public envelope fields are `format`, `version`, `owner`, `keyring` (KDF parameters and two wrapped keys), and `ciphertext` (IV and authenticated ciphertext). This same envelope is used for cloud persistence and encrypted JSON backups.
- Each save checks a database revision under a row lock. Stale sessions fail closed and retain unsaved work for export. This is concurrency protection, not cryptographic protection against a malicious server rolling back history.

The passphrase recovery operation rewraps the existing data key. It does **not** rotate that key or revoke old backups, passphrases used with old keyrings, or a compromised recovery key. A compromised-key incident would require creating a fresh data key and migrating to a fresh vault.

## Backups and migration

**Export encrypted backup** encrypts the current in-memory journal, including unsaved edits and reminders. The backup is self-contained: its original vault passphrase or recovery key can decrypt it even after you change the current vault passphrase. Imports decrypt locally, show the existing merge preview, and are re-encrypted under the destination account's current vault.

Legacy plaintext JSON imports remain supported. Markdown export is intentionally unencrypted and asks for confirmation. Local mode (empty `config.js`) remains the original unencrypted browser journal; the published configured app uses cloud encryption.

Conversion deletes live plaintext rows only. Database backups, WAL/history retained by the provider, old downloaded files, original localStorage entries, and device copies may still contain plaintext. The app does not claim to securely erase those copies. Before migration, existing legacy entries necessarily travel from Supabase to the browser over HTTPS for encryption.

## Threat model and remaining metadata

Encryption protects journal content from someone who can read database rows or copied encrypted backups but lacks the vault secrets. Supabase still sees the account email/UUID, access times, revision counters, vault size, salt, IVs, wrapped keys, and ciphertext. Static school schedules are public and are not encrypted. Attachment UI is not implemented; the reserved Storage bucket is not used by this encryption feature.

Browser encryption relies on the integrity of the HTML/JavaScript delivered by GitHub Pages and the device running it. A compromised publishing account, malicious browser extension, malware, or injected same-origin script could capture secrets while the vault is unlocked. A restrictive Content Security Policy and bundled SDK reduce script-loading exposure, but are not a defense against a compromised publisher. JavaScript garbage collection cannot guarantee forensic erasure of memory.

Weak vault passphrases remain vulnerable to offline guessing against a copied keyring. Use a unique, strong passphrase and keep the recovery key private. This implementation is tested, but has not received an independent cryptographic security audit.

## Database installation

For the existing deployment, run **only `supabase/002-encrypted-vault.sql`** in Supabase SQL Editor. For a new project, run `schema.sql` followed by `002-encrypted-vault.sql`. The encryption migration can be rerun; it does not convert or delete entries by itself.

The migration removes legacy write privileges immediately. Old app tabs must reload the encrypted version to save again. A vault is created only after the signed-in user saves their recovery key and submits the encrypted conversion. New functions reject unencrypted envelopes, bind all mutations to `auth.uid()`, and retain Row Level Security for reads. There is no application fallback to plaintext cloud writes.

## Verification

`npm ci`, then `npm test` and `npm run test:browser` (Chromium defaults to `/usr/bin/chromium`; override with `CHROMIUM_PATH`). Dependencies are development-only; the site remains static and needs no build or package installation to run.

Tests exercise encryption/decryption, randomized IVs, malformed formats, tamper detection, wrong passphrases, recovery, encrypted write queuing/retries/conflicts, and locked sessions. An embedded PostgreSQL test runs the actual migrations and checks anonymous/cross-account access, revision rejection, atomic legacy cleanup, and closure of old plaintext write paths. Browser tests intercept Supabase requests; they never register real accounts or touch live journals.

References: [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API), [AES-GCM parameters](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams), [OWASP password derivation guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

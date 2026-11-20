# GG-O connected backend — 2026-11-19

Site: https://gg-o-kculture.fitfern517.chatgpt.site
Supabase project: GG-O (`dsmmcbuwpxlanfjywmps`, Singapore).

The production build uses the public configuration in `src/lib/backend-config.ts`. There are no server secrets in the browser or repository. Development/tests remain offline unless the public environment variables are explicitly supplied. The source repository is the shared development source for continuing on another device.

## Applied

- Existing migrations 001 through animation-category were reviewed and applied together as `ggo_existing_site_foundation` to the empty project.
- `ggo_connected_content`: private news/events, stable per-story anonymous comment numbers, account-specific reactions, operator-only edits, obsolete direct table access revoked.
- `ggo_initial_editorial_content`: existing two news articles, two event concepts, three magazine articles and three polls; no fake users, comments, votes or community posts were imported.
- `ggo_public_read_and_hardening`: public sanitized reading, restricted writes, foreign-key indexes.
- Supabase Edge Function `ggo-write`: checks the session with Supabase Auth, verifies Google identity for writing, validates input, and calls the service-role-only writer. Function-level JWT verification is disabled because the function performs explicit Auth verification for every non-preflight request. Missing/invalid sessions are rejected.

Remote migration history consolidates the old scripts. Do not blindly run `db push` with all legacy filenames against this already initialized project. Inspect remote history and reconcile the baseline first. Keep new migrations explicit and reviewed.

## Deliberate behavior

- Public pages read server data and do not silently fall back to local data on failure.
- Production ignores/clears AAAA/BBBB demo login; these accounts never become real administrators.
- News comments display at most 100 per story; list endpoints return at most 100 stories/events. Add pagination before exceeding those limits.
- Images on news/events are size-limited inline data or existing local assets. Poll/magazine uploads use the admin-only `poll-media` bucket.
- The Supabase Edge runtime does not have the Cloudflare Worker's verified `request.cf` contract. Caller-supplied forwarded IP headers are not trusted. New records therefore have a null IP, and the admin UI says IP not collected. Account identity is recorded privately. Signed-in views are deduplicated per account/post/UTC day. Guest views do not increment the counter.
- Emergency intake remains disabled; it needs an actual operating process and retention schedule.
- Local demo edits on other browsers were not migrated; their contents are not available in this workspace.

## Required account setup before live membership

The Auth settings endpoint reports Google and Facebook disabled. No real members currently exist. This blocks real OAuth, cross-device member login testing and assigning the owner's admin role.

1. Create/configure a Google OAuth Web client for the owner's Google project. Its authorized redirect URI is `https://dsmmcbuwpxlanfjywmps.supabase.co/auth/v1/callback`.
2. In Supabase Authentication → Sign In / Providers → Google, enable Google and enter the OAuth client ID/secret in the dashboard. Do not put the secret into this repository or chat.
3. Set Auth Site URL to `https://gg-o-kculture.fitfern517.chatgpt.site` and allow `https://gg-o-kculture.fitfern517.chatgpt.site/auth/callback/` as a redirect URL.
4. The owner signs in on GG-O. Identify that actual account before assigning `profiles.role='admin'` through the trusted database connection; never grant the first registrant admin automatically.
5. Test two real accounts and two devices: create/read/comment, anonymous labels, own-write protection, poll participation, operator publishing, reaction isolation and sign-out. Full OAuth end-to-end verification remains pending these steps.

## Validation

`supabase/tests/connected_content.sql` executes transactional checks with temporary identities and rolls back all test data. It verifies role restrictions, ownership, banned users, persistence, reaction isolation and stable anonymous numbers. Unit/UI tests include the new Supabase writer's identity validation and input/error sanitization. SQL checks confirm ordinary roles cannot execute the trusted writer or read private identity mappings.

Supabase advisors after changes: no ERROR-level security findings and no health findings. Remaining SECURITY DEFINER warnings identify intentionally exposed, authorization-checked/sanitized RPCs; RLS-no-policy entries are intentionally denied tables accessed only through these functions. Performance warnings include repeated auth evaluation in legacy defense-in-depth policies; unused-index notices are expected on a newly initialized empty membership database. This is not a claim of a comprehensive security audit or legal launch readiness.

## Account consent and returning login (2026-11-19)

Login buttons now initiate OAuth directly. Signup is requested only when the authenticated account lacks the current legal-version consent. Consent records live in `public.member_consents`, with RLS limiting reads/inserts to the account owner; clients cannot edit timestamps or other members' records. Each legal version is recorded once. Read/write failures are surfaced rather than silently accepted.

Legacy browser-only consent records are not automatically attributed to any account. Existing members may need one explicit confirmation after this update; it is then shared across devices. Browser storage is only a pending signup draft. Google is enabled and the owner has reported successful login with the same account handle on two devices. Facebook developer registration is blocked by Meta's unfamiliar-device security restriction. The owner-confirmed account has been assigned the admin role through the trusted database connection. The same anonymous_access RPC used by the UI returns is_admin=true.

Regression coverage: `tests/member-consent.test.ts`, `tests/consent.test.ts`, and the transactional/RLS test `supabase/tests/member_account_consent.sql` (all temporary data rolled back).


## Contact and operator update (2026-11-20)

Site contact text and mailto links (Korean, Vietnamese, English), including About, footer and privacy/support contact notices, use contact.us.ggo@gmail.com. The owner reports that login/logout now works on web and mobile. Refresh the site to reload operator permissions.

# SiSkill free package distribution

The first free release is `og-image@1.0.4`. Downloads require a registered, authenticated shared account but no paid
membership, create no payment/order/grant rows, and do not call WebToMind billing.

## Package and review

The release is an isolated snapshot of the user's WebToMind content repository, with
existing authorship and `skills-2026-10-v2` use license retained. SiSkill is its official
distribution entry. Source templates and scripts were reviewed; no third-party Skill,
stock image, font file, browser binary or huashu-motion implementation is included.
Internal recipe IDs are omitted; example domains use example.com and all names/data
are fictional. Three current-session renders (English blog and launch, Chinese docs)
are included with editable inputs. These are execution checks, not independent Agent
discovery or customer cases. The original dirty content checkout was not edited.

The archive includes SKILL.md, skill.json, template, renderer, LICENSE.md,
DEPENDENCIES.md, INSTALL.md and the reviewed examples. Commercial finished outputs
are permitted by the retained license; generic package redistribution is restricted.
Single-Skill purchase authorization now covers the same Skill's later published versions,
matching the paid-license update promise. Free access does not grant paid catalog rights.

## Distribution boundary

`apps/siskill/free-releases.json` is the exact version/hash/size allowlist. The download
route is `/api/siskill/free/og-image/1.0.4`. A separate private R2 bucket
`siskill-free-packages` is bound as `SISKILL_FREE_PACKAGES`; its r2.dev URL is disabled.
There is no public bucket listing or arbitrary-key endpoint. Paid archives must never
enter this bucket or allowlist. Public app assets still reject all archive extensions.

The server checks actual downloaded bytes against the allowlist SHA-256 before returning
them; the browser verifies again before saving. Missing binding/object, wrong size,
corruption and storage errors fail closed. Only GET/HEAD are accepted. Error responses
and authenticated successes are never cached. GET and HEAD both validate the bearer
session against Supabase and reject anonymous accounts before reading R2. Do not overwrite a published key or
change the bytes behind an existing version. Use a new version for corrections.

## Installation and acceptance

Extract and review the archive, then place the whole folder in the project at
`.agents/skills/og-image/` for Codex or `.claude/skills/og-image/` for Claude Code. Preserve
any existing installation before replacing it. Dependency setup is explicit in the
package; scripts do not install dependencies. Tested rendering uses Node 24.14.0,
Playwright 1.58.2 and macOS; other systems and automatic discovery are not certified.

Layout references checked 2026-10-21: [Codex skills](https://learn.chatgpt.com/docs/build-skills)
and [Claude Code skills](https://code.claude.com/docs/en/skills).

Release acceptance includes strict package validation, privacy scan plus visual source
and output review, deterministic archive hashing, extraction into both project layouts,
actual offline rendering, desktop/mobile download interactions, simulated corrupt-response
rejection, exact-commit CI and production download/installation verification. Local evidence
is under `output/siskill-free/`; installation archives and their source are intentionally
outside the public repository. Worker-only rollback leaves the private archive intact.

# Prompt content review

Prompt text, localized text, titles, source references and media are reviewed
content. Changing those fields without a new approval moves an `indexable`
case to `review`. Counters, ordering and no-op saves preserve its status.
Drafts remain drafts. Existing cases are not automatically approved by the
migration.

Before approving a new or changed case, compare the complete prompt against
its source, title and media. Check translations preserve the same task and
constraints. Set `seo_evidence.content_verified` to `true` and supply a fresh
`seo_reviewed_at`, in addition to the existing source/media evidence. The
Admin API accepts these through `seoEvidence` and an explicit
`seoStatus: "indexable"`. Read the returned status: saving a row does not by
itself mean it was approved. Do not automatically set verification evidence
inside an importer or translation job.

Exact displayed-prompt duplicates in the same locale, after whitespace
normalization, save as `review`. Choose and document one indexed owner while
preserving other records and URLs. The fingerprint is a duplicate guard, not
a semantic or translation-quality assessment. A concurrent publication may
return PostgreSQL `40001`; retry the transaction and inspect its final status.
The database unique constraint prevents two concurrent claims for the same
locale and content.

When a verified original is available but its translation cannot be verified,
keep the original text and identify it as an original. Identical localized
fields render once as “Original prompt”, rather than as two translations.
Do not represent an original-source restoration as a newly verified translation.

For production repairs, retain a private pre-write backup and provenance,
compare the expected editorial fields immediately before writing, and apply
reviewed changes atomically. Verify the saved values, actual SEO status,
rendered page and sitemap after caches refresh. Keep source archives and full
third-party prompt collections outside this public repository.

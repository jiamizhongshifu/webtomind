# SiSkill marketplace flow and SEO review

Reviewed 2026-10-21. Scope: SiSkill's independent storefront, shared account identity,
separate orders and membership. Public competitor pages describe their own products;
this is not an independent audit of their security, usage statistics or revenue.

## What we adopted

| Reference | Observed public experience | SiSkill decision |
| --- | --- | --- |
| [Skillry](https://skillry.dev/) | Task/output discovery, Free/Premium access, subscription plans, web/CLI install paths | Make released packages the default discovery view; explicitly expose previews. Keep current single purchases and Pro; no new lifetime promise. |
| [Skillry report-deck detail](https://skillry.dev/skills/bs-audio-report-deck) | Deliverable examples, version, dependencies and installation guidance are close to the product | Expose version, project installation path, starter brief and guide from released Skill details. Prioritize released related products. |
| [Skillry Claude Code guide](https://skillry.dev/learn/agents/claude-code) | A dedicated installation guide supports the product page | Add a bilingual public guide and library links. SiSkill has no shipped CLI; do not advertise one. |
| [YouMind marketplace](https://youmind.com/zh-CN/skills) | Discovery through examples, categories, creators and curated collections | Retain original output demonstrations and add Writing to home task navigation. Default to the four actually released packages. |
| [YouMind's Skill guide](https://youmind.com/guides/skills) | Describes reusable input/method/output workflows with concrete examples and ordinary-input checks | Connect purchase/download to a realistic first task and troubleshooting, rather than ending at a downloaded archive. |

YouMind's public creator rewards mention credits/benefits. This is not evidence of a
cash payout system. SiSkill remains a reviewed studio collection; no seller onboarding,
revenue share or third-party redistribution rights are implied. Competitor packages,
copy, reviews and customer counts were not imported.

## Implemented customer journey

1. Discover: catalog defaults to Available now (one free, three paid). Preview and
   All releases expose the eight unreleased demos. Search covers names, summaries,
   task tags and declared agents. Free discovery has a clean `/skills/free` URL.
2. Evaluate: detail retains video, examples, inputs, outputs and dependencies, then
   adds version, Codex/Claude Code folder selection and a copyable starter brief.
3. Access: every package still requires authentication. Free, single-purchase and
   Pro routes keep their existing authorization boundaries. A published product
   does not show “Coming soon” just because its price is still loading or checkout
   is temporarily unavailable.
4. Install: `/learn/install-skills` explains archive verification, directory layout,
   dependencies, first run and support. A starter brief does not reveal paid package
   source or grant download rights. The library displays localized product names,
   links back to details and links onward to installation.
5. Continue: guide explains active-member downloads, locally retained versions,
   order-scoped refund revocation, updates and commercial output versus package resale.
   These are explanations of the existing contract; billing behavior is unchanged.

Installation paths were checked against the current official
[Codex local Skill documentation](https://learn.chatgpt.com/docs/build-skills) and
[Claude Code documentation](https://code.claude.com/docs/en/skills). Agent discovery
can depend on installation context and policy; the guide provides a SKILL.md fallback.

## Search implementation

- Public HTML contains visible page-specific product/guide/catalog content before
  JavaScript executes. React replaces that content with the interactive experience.
  No bot-specific content or hidden keyword blocks.
- Shared page metadata drives server and client titles, descriptions, canonical URLs,
  robots and reciprocal `en-US` / `zh-CN` / `x-default` language links.
- Product, BreadcrumbList, WebSite and collection ItemList JSON-LD describe actual
  visible content. Paid offers require current enabled commerce, published exact
  release and a valid positive price. No fabricated ratings, stock counts or dates.
- Public product lookup has a 2.5-second bound; when unavailable, content renders
  without a paid Offer. It never reads user cookies, grants or order data.
- Accounts, unknown routes, filtered/search pages and unreleased preview products
  are noindex. Acquisition parameters alone preserve indexability. Filter pages
  remain crawlable so search engines can observe noindex.
- The sitemap has 18 URLs: nine indexable pages in each language (home, collection,
  free collection, pricing, installation guide and four released products).
  Preview details remain navigable but are excluded from the sitemap.
- Old free-tier URLs redirect to the clean collection while keeping search and
  attribution parameters. Unknown pages keep HTTP 404.
- JSON-LD and visible strings are escaped; authenticated routes serialize no
  account details. Download archives remain outside public assets.

References: Google's [JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics),
[Product snippets](https://developers.google.com/search/docs/appearance/structured-data/product-snippet),
[localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)
and [noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing).
JavaScript pages can be indexed; this change makes public information available
without waiting for rendering. Valid markup does not guarantee a rich result,
indexation or improved ranking.

## Next priorities, with acceptance criteria

| Priority | Work | Acceptance |
| --- | --- | --- |
| Next | Verify SiSkill's own Search Console property and submit the new sitemap | Correct domain property, sitemap accepted and URL inspection evidence. This release does not claim submission or indexation. |
| Next | Measure the independent discovery → detail → auth → checkout → verified download funnel | Separate SiSkill attribution; successful order evidence from server/webhook, not return-page visits. Do not substitute WebToMind GA data. |
| Next | Release additional paid workflows with original examples | Sanitized licensed archive, actual run, verified delivery and demonstrable output before removing Preview. |
| Later | Search landing pages by task/agent | Enough released products and distinct useful copy per page; avoid thin pages for empty categories. |
| Later | Authenticated installation CLI | Browser login, narrowly scoped revocable credentials, verified package digest, exact entitlement checks and cross-platform acceptance. |
| Later | External creator marketplace | Define review, ownership, refund responsibility and settlement before offering seller payouts. |

Release evidence is retained locally under `output/siskill-market-seo/RELEASE.md`.
Payment/refund execution was not repeated for this presentation and SEO change.

# WebToMind design system

This is the public, repository-owned contract used by CI. Agent skills may help
review a change, but installing a private skill is not a build prerequisite.
Marketing may use the neon theme; creation tools remain task-focused. Domain
layout, media ratios and editor gestures belong to their feature components.

## rule/component-semantics-before-style

Use `src/shared/ui` for common controls. The `radix` compatibility entry points
map onto the same Button/Input contracts; keep `asChild` for native link
composition. New consumers should prefer the public primitives. Primary buttons
have an explicit non-submit default, loading disables activation, and icon-only
controls need an accessible name. Preserve intentional compact and domain sizes.
Primary CTA labels must remain readable at 360, 390 and 430 CSS pixels.

`shared-tokens.css` owns the spacing and radius scales. Themes may supply color,
material and typography values, but must not redefine the dimensional scale.
`--product-action-hsl` and `--product-action-text-hsl` supply both CSS product
buttons and the HSL aliases used by Tailwind/shadcn, including dark mode.

## rule/action-sheet-global-layer

Modal overlays must focus their content, contain Tab/Shift+Tab, close with
Escape when allowed, lock background scrolling and restore prior focus.
Lazy content must receive focus when it arrives. Reuse Dialog, ActionSheet,
DialogPrimitives or useOverlayBehavior rather than only adding `aria-modal`.
Keep feature zoom, pan and media behavior in domain components.

Global layer roles live in shared-tokens. Editor-local image/selection/hint/busy
layers live on `.image-editor-page`; their numbers are local compositing order,
not global modal levels. This migration preserves the existing layer order.
Do not raise a layer to fix clipping without inspecting its stacking context.

## rule/layered-visual-language

Themes extend semantic variants. Glass and neon styling must not change focus,
loading, target size or layout ownership. Respect reduced motion. Keep page CSS
for geometry rather than reimplementing shared control states.

## rule/design-system-adapter-boundary

Direct Radix and generated shadcn imports belong inside `src/shared/ui` only.
`components.json` must keep generated sources in `src/design/shadcn-reference`.
The compatibility import budget and numeric z-index budget may only decrease;
do not increase limits just to pass CI. New exceptions require a concrete
component rationale and browser evidence in the change description.

## rule/image-loading-priority-by-viewport

Use `imageFetchPriority` for native React 18 image fetch priority attributes.
Load above-the-fold content eagerly when justified; defer off-screen media.
Do not give every image high priority or change media aspect ratio during load.

## Validation and metric scope

Run `pnpm audit:ui-governance` and `pnpm audit:design-system` from a clean checkout.
CI runs both. Include focused behavioral tests and desktop/mobile browser
verification for affected interactions, themes and states.

Usage reports distinguish product consumers, shared implementation, development
harnesses, tests and paused features. The maintained workspace remains visible
as a separate scope count. Import/tag/class occurrences are signals, not an
adoption percentage or a count of independent components. Shared components may
retain feature-specific geometry classes without being counted as unmigrated.

Run `pnpm audit:design-system:browser` against a running local web server with
`DESIGN_SYSTEM_BASE_URL`. It uses simulated data and checks focus, CTA labels,
compatibility controls and theme parity; it does not create production data.

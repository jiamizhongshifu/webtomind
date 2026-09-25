export type DesignSystemDomain =
  | 'marketing'
  | 'create'
  | 'workspace'
  | 'shared';

export type DesignSystemMigrationPhase =
  | 'foundation'
  | 'marketing-convergence'
  | 'creator-convergence'
  | 'workspace-convergence'
  | 'enforcement';

export interface DesignSystemComponentFamily {
  family: string;
  target: string;
  phase: DesignSystemMigrationPhase;
  domains: DesignSystemDomain[];
  currentSignals: string[];
  contract: string[];
  liquidGlassPolicy?:
    | 'not-applicable'
    | 'variant-only'
    | 'allowed-for-elevated-surfaces';
}

export const designSystemComponentRegistry: DesignSystemComponentFamily[] = [
  {
    family: 'Button',
    target: 'src/shared/ui/Button.tsx, src/shared/ui/ButtonLink.tsx',
    phase: 'foundation',
    domains: ['marketing', 'create', 'workspace', 'shared'],
    currentSignals: [
      '.btn-primary',
      '.btn-secondary',
      '.btn-gradient',
      '.btn-ghost',
      '.ui-btn-*',
      'link CTAs'
    ],
    contract: [
      'One API for primary, secondary, outline, ghost, danger, glass, icon-adjacent buttons, and link-styled CTAs.',
      'Owns loading, disabled, icon placement, focus ring, and minimum touch target behavior.',
      'Navigation CTAs use ButtonLink instead of page-level utility/button class stacks.',
      'Primary CTAs stay high contrast; Liquid Glass is not the default primary button treatment.',
      'Pressed feedback starts at pointer-down with scale(0.98) over 100ms and is removed for reduced motion.'
    ],
    liquidGlassPolicy: 'variant-only'
  },
  {
    family: 'IconButton',
    target: 'src/shared/ui/IconButton.tsx, src/shared/ui/IconLink.tsx',
    phase: 'foundation',
    domains: ['marketing', 'create', 'workspace', 'shared'],
    currentSignals: [
      '.btn-icon',
      'inline lucide buttons',
      'thumbnail action buttons'
    ],
    contract: [
      'One square/circle control for icon-only actions.',
      'Icon-only links use IconLink with the same variant, size, and accessible-label contract.',
      'Requires accessible label, 44px mobile target, hover/focus/pressed states.',
      'Supports solid, ghost, and media-overlay variants.'
    ],
    liquidGlassPolicy: 'allowed-for-elevated-surfaces'
  },
  {
    family: 'DynamicIcon',
    target: 'src/shared/ui/motion-icons/index.tsx',
    phase: 'foundation',
    domains: ['marketing', 'create', 'workspace', 'shared'],
    currentSignals: [
      'inline lucide icons',
      'static CTA icons',
      'itshover/itshover animated icons'
    ],
    contract: [
      'Motion icons enter the app only through the shared DynamicIcon adapter boundary.',
      'Icon motion is decorative and must not own button/link semantics, cursor behavior, accessible names, or hit targets.',
      'Reduced-motion users keep the same icon shape without hover animation.',
      'Third-party icon sources are copied and adapted inside shared primitives, never imported directly into pages.'
    ],
    liquidGlassPolicy: 'not-applicable'
  },
  {
    family: 'Surface',
    target: 'src/shared/ui/Surface.tsx',
    phase: 'foundation',
    domains: ['marketing', 'create', 'workspace', 'shared'],
    currentSignals: [
      '--surface-glass-*',
      '--liquid-glass-*',
      '--prompt-glass-*',
      '.ui-card'
    ],
    contract: [
      'One semantic wrapper for solid, subtle, raised, glass, and overlay surfaces.',
      'Glass surfaces must have a solid fallback and tokenized blur/alpha.',
      'Surface does not own layout; callers still define grid and flow.'
    ],
    liquidGlassPolicy: 'allowed-for-elevated-surfaces'
  },
  {
    family: 'Card',
    target: 'src/shared/ui/Card.tsx',
    phase: 'foundation',
    domains: ['marketing', 'create', 'workspace', 'shared'],
    currentSignals: [
      'feature-card',
      'scenario-card',
      'hot-case-card',
      'create-gallery-card',
      'workspace card'
    ],
    contract: [
      'One card shell with density, media, footer, and interactive variants.',
      'CTA position is controlled by card slots, not one-off page CSS.',
      'Cards define radius and border, but domain components define content.'
    ],
    liquidGlassPolicy: 'variant-only'
  },
  {
    family: 'MediaTile',
    target: 'src/shared/ui/MediaTile.tsx',
    phase: 'foundation',
    domains: ['marketing', 'create', 'shared'],
    currentSignals: [
      'prompt case cards',
      'gallery thumbnails',
      'generation record thumbnails',
      'VisualImageTile'
    ],
    contract: [
      'One media ratio, loading, eager/lazy, object-fit, and action-overlay contract.',
      'Thumbnail click opens preview when preview is the primary action.',
      'Low-frequency actions move to menu/action sheet on mobile.'
    ],
    liquidGlassPolicy: 'allowed-for-elevated-surfaces'
  },
  {
    family: 'BadgeChipStatus',
    target: 'src/shared/ui/Badge.tsx',
    phase: 'foundation',
    domains: ['marketing', 'create', 'workspace', 'shared'],
    currentSignals: [
      'model labels',
      'status chips',
      'credits pills',
      'case meta labels'
    ],
    contract: [
      'One chip/badge/status scale with semantic color and density variants.',
      'Never use low-contrast text on saturated backgrounds.',
      'Model/provider labels use shared formatting and truncation behavior.'
    ],
    liquidGlassPolicy: 'not-applicable'
  },
  {
    family: 'FormControls',
    target:
      'src/shared/ui/FormField.tsx, src/shared/ui/FieldMessage.tsx, src/shared/ui/Input.tsx, src/shared/ui/Select.tsx, src/shared/ui/SelectPrimitives.ts, src/shared/ui/SearchField.tsx, src/shared/ui/Textarea.tsx',
    phase: 'foundation',
    domains: ['marketing', 'create', 'workspace', 'shared'],
    currentSignals: [
      'newsletter form',
      'gallery search',
      'model select',
      'prompt textarea',
      'account inputs'
    ],
    contract: [
      'One label, help text, validation, aria-describedby, invalid, and disabled contract.',
      'Search/filter toolbars stay compact on mobile.',
      'Native controls are preferred where mobile platform behavior is better.'
    ],
    liquidGlassPolicy: 'variant-only'
  },
  {
    family: 'Overlay',
    target:
      'src/shared/ui/Dialog.tsx, src/shared/ui/DialogPrimitives.ts, src/shared/ui/PopoverPrimitives.ts, src/shared/ui/ActionSheet.tsx, src/shared/ui/useOverlayBehavior.ts',
    phase: 'foundation',
    domains: ['create', 'workspace', 'shared'],
    currentSignals: [
      'preview modal',
      'history modal',
      'upload modal',
      'workspace modal',
      'popover',
      'action sheet'
    ],
    contract: [
      'One z-index, focus trap, escape close, backdrop, scroll lock, and safe-area contract.',
      'Desktop uses dialog/popover; mobile uses bottom action sheet for low-frequency actions.',
      'CTA areas cannot overlap prompt, metadata, or scrollable content.',
      'ActionSheet supports interruptible drag, velocity projection, upward rubber-band, pointer capture, and one symmetric exit path.',
      'Reduced motion keeps focus and drag semantics while replacing movement with a 160ms opacity transition.'
    ],
    liquidGlassPolicy: 'allowed-for-elevated-surfaces'
  },
  {
    family: 'Navigation',
    target: 'src/shared/ui/navigation/index.tsx',
    phase: 'marketing-convergence',
    domains: ['marketing', 'create', 'workspace'],
    currentSignals: [
      'TopNav',
      'CreateSideNav',
      'CreatorMiniNav',
      'bottom nav',
      'WorkbenchTopbar'
    ],
    contract: [
      'One active state, focus, icon sizing, density, and responsive collapse contract.',
      'Marketing navigation can be expressive; product navigation stays task-focused.',
      'Top-level layout aligns to shared grid tokens.'
    ],
    liquidGlassPolicy: 'allowed-for-elevated-surfaces'
  },
  {
    family: 'FeedbackState',
    target: 'src/shared/ui/EmptyState.tsx, src/shared/ui/FeedbackMessage.tsx',
    phase: 'foundation',
    domains: ['marketing', 'create', 'workspace', 'shared'],
    currentSignals: [
      'empty states',
      'loading panels',
      'error cards',
      'toast-like inline states'
    ],
    contract: [
      'One empty, loading, success, warning, and error state language.',
      'Messages must describe the user-visible next action.',
      'Inline states avoid blocking the main workflow unless user action is required.'
    ],
    liquidGlassPolicy: 'variant-only'
  },
  {
    family: 'ShadcnAdapterBoundary',
    target: 'components.json, src/design/shadcn-reference, src/shared/ui',
    phase: 'enforcement',
    domains: ['shared'],
    currentSignals: [
      '@radix-ui/* imports',
      '@/design/shadcn-reference imports',
      'components.json aliases'
    ],
    contract: [
      'shadcn/ui generated sources live in an isolated reference directory, not in src/shared/ui.',
      'Business pages import WebToMind shared primitives from @/shared/ui, never Radix or shadcn-reference directly.',
      'Radix behavior can be adopted inside shared adapters when it improves focus, escape, portal, or accessibility contracts.'
    ],
    liquidGlassPolicy: 'not-applicable'
  }
];

export const deprecatedDesignClassFamilies = [
  'btn-primary',
  'btn-secondary',
  'btn-gradient',
  'btn-ghost',
  'btn-icon',
  'feature-card',
  'scenario-card',
  'advantage-card',
  'pipeline-card',
  'hot-case-card',
  'create-gallery-card',
  'prompt-browser-card'
];

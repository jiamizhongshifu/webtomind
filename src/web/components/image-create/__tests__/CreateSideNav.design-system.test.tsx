import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'src/web/components/image-create/CreateSideNav.tsx'),
  'utf8'
);
const miniNavSource = readFileSync(
  join(process.cwd(), 'src/web/components/image-create/CreatorMiniNav.tsx'),
  'utf8'
);
const accountMenuSource = readFileSync(
  join(process.cwd(), 'src/web/components/image-create/CreatorAccountMenu.tsx'),
  'utf8'
);
const imageCreateCss = readFileSync(
  join(process.cwd(), 'src/web/styles/image-create.css'),
  'utf8'
);
const accountMenuCss = readFileSync(
  join(process.cwd(), 'src/web/styles/creator-account-menu.css'),
  'utf8'
);
const geistThemeCss = readFileSync(
  join(process.cwd(), 'src/web/styles/geist-theme.css'),
  'utf8'
);
const videoStudioCss = readFileSync(
  join(process.cwd(), 'src/web/styles/video-studio.css'),
  'utf8'
);
const sideNavUpgradeCss = readFileSync(
  join(
    process.cwd(),
    'src/web/components/image-create/CreateSideNavUpgrade.css'
  ),
  'utf8'
);

describe('CreateSideNav design-system overlay contracts', () => {
  it('keeps system announcements on shared overlay behavior', () => {
    expect(source).toMatch(
      /import\s+\{[^}]*Button[^}]*useOverlayBehavior[^}]*\}\s+from\s+'@\/shared\/ui'/
    );
    expect(source).toContain(
      'const announcementsModalRef = useOverlayBehavior<HTMLElement>'
    );
    expect(source).toContain('ref={announcementsModalRef}');
    expect(source).toContain('tabIndex={-1}');
    expect(source).not.toContain('window.addEventListener');
    expect(source).not.toMatch(/event\.key === 'Escape'/);
  });

  it('keeps rail navigation entries left-aligned after shared primitive migration', () => {
    expect(source).toMatch(
      /import\s+\{[^}]*DynamicIcon[^}]*NavigationLink[^}]*\}\s+from\s+'@\/shared\/ui'/
    );
    expect(source).toContain('name={item.motionIcon}');
    expect(source).toContain('className="create-side-nav-motion-icon"');
    expect(source).toContain('icon: navIcon');
    expect(source).toContain(
      'const startIconMotion = () => iconRef.current?.startAnimation();'
    );
    expect(source).toContain('onMouseEnter: startIconMotion');
    expect(source).toContain('onFocus: startIconMotion');
    expect(source).toContain('variant="rail"');
    expect(source).toContain('orientation="vertical"');
    expect(imageCreateCss).toMatch(
      /\.create-side-nav\s+\.ui-navigation\s*\{[\s\S]*?align-items:\s*stretch;[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /\.create-side-nav\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /\.create-side-nav-scroll\s*\{[\s\S]*?flex:\s*1\s+1\s+auto;[\s\S]*?overflow-y:\s*auto;[\s\S]*?overscroll-behavior:\s*contain;[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /\.image-create-page\.image-create-page-with-side-nav\s+\.create-side-nav\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /\.create-side-nav\s+nav\s*\{[\s\S]*?flex:\s*0\s+0\s+auto;[\s\S]*?overflow:\s*visible;[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /\.create-side-nav\s+\.ui-navigation-link\s*\{[\s\S]*?justify-content:\s*flex-start;[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /\.create-side-nav\s+nav\s+a\s*>\s*span:not\(\.ui-navigation-link__icon\):not\(\.ui-navigation-link__badge\)\s*\{[\s\S]*?text-align:\s*left;[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /\.dark\s+\.create-side-nav\s+nav\s+a\s+strong\s*\{[\s\S]*?background:\s*#ff9a7a;[\s\S]*?color:\s*#17110d;/
    );
    expect(geistThemeCss).not.toMatch(
      /\.create-side-nav\s+nav\s+a\s+strong\s*\{[^}]*!important/
    );
    expect(videoStudioCss).toMatch(
      /\.dark\s+\.video-studio-v2\s+\.create-side-nav\s+nav\s+a\s+strong\s*\{[\s\S]*?color:\s*#17110d;/
    );
  });

  it('keeps the brand mark visible beside compact utility controls', () => {
    expect(source).toContain(
      '<Logo size={26} className="create-side-nav-logo" />'
    );
    expect(imageCreateCss).toMatch(
      /\.create-side-nav-logo\s*\{[\s\S]*?flex:\s*0\s+0\s+26px;/
    );
    expect(accountMenuCss).toMatch(
      /:is\(\.create-side-nav-social-link,\s*\.create-side-nav-icon-action\)\s*\{[\s\S]*?--create-side-nav-utility-icon-size:\s*13px;[\s\S]*?width:\s*26px;[\s\S]*?min-width:\s*26px;[\s\S]*?height:\s*26px;/
    );
    expect(accountMenuCss).toMatch(
      /:is\(\.create-side-nav-social-icon,\s*\.create-side-nav-icon-action svg\)\s*\{[\s\S]*?width:\s*var\(--create-side-nav-utility-icon-size\);[\s\S]*?height:\s*var\(--create-side-nav-utility-icon-size\);/
    );
  });

  it('collapses the shared desktop rail and persists the preference', () => {
    expect(source).toContain('CREATE_SIDE_NAV_COLLAPSED_STORAGE_KEY');
    expect(source).toContain("'webtomind:create-side-nav-collapsed'");
    expect(source).toContain("' is-collapsed'");
    expect(source).toContain('aria-expanded={!isCollapsed}');
    expect(source).toContain('aria-controls="create-side-nav-links"');
    expect(source).toContain('<ChevronLeft aria-hidden="true" />');
    expect(source).toContain('<ChevronRight aria-hidden="true" />');
    expect(imageCreateCss).toMatch(
      /@media \(min-width: 921px\)[\s\S]*?:has\([\s\S]*?> \.create-side-nav\.is-collapsed[\s\S]*?--create-side-nav-width:\s*var\(--create-side-nav-collapsed-width\);[\s\S]*?--create-side-nav-offset:\s*var\(--create-side-nav-collapsed-offset\);/
    );
    expect(imageCreateCss).toMatch(
      /\.create-side-nav\.is-collapsed\s+nav\s+a\s*\{[\s\S]*?justify-content:\s*center;/
    );
  });

  it('keeps bottom account actions on the same left-aligned rail baseline', () => {
    expect(source).toContain('create-side-nav-icon-action');
    expect(source).not.toContain('resolvedPromptLibraryFavoritesItem');
    expect(source).not.toContain('icon={<Heart size={17} />}');
    expect(source).toContain('resolvedPromptLibraryAdminItem &&');
    expect(source).toContain('icon={<Settings size={17} />}');
    expect(source).toContain(
      'const resolvedPromptLibraryAdminItem = isPromptCaseAdmin'
    );
    expect(source).toContain('const isPromptLibrarySecondaryEntryActive =');
    expect(source).not.toContain('promptLibraryModelItems');
    expect(source).not.toContain('showPromptModelSubmenu');
    expect(source).not.toContain('create-side-nav-submenu');
    expect(source).not.toContain('create-side-nav-submenu-favorites');
    expect(source).not.toContain('create-side-nav-submenu-admin');
    expect(source).not.toContain(
      'className="create-side-nav-announcement-trigger"'
    );
    expect(source).toContain('className="create-side-nav-upgrade"');
    expect(source).toContain('className="create-side-nav-referral-trigger"');
    expect(accountMenuSource).toContain('creator-account-upgrade');
    expect(imageCreateCss).toMatch(
      /\.create-side-nav\s*\{[\s\S]*?--create-side-nav-rail-inset:\s*14px;[\s\S]*?--create-side-nav-rail-radius:\s*14px;[\s\S]*?--create-side-nav-rail-height:\s*42px;[\s\S]*?padding:\s*18px\s+var\(--create-side-nav-rail-inset\)[\s\S]*?var\(--create-side-nav-rail-inset\);[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /\.create-side-nav-bottom\s*\{[\s\S]*?position:\s*static;[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /\.image-create-page\.image-create-page-with-side-nav[\s\S]*?\.create-side-nav[\s\S]*?>\s*\.create-side-nav-bottom\s*\{[\s\S]*?position:\s*static;[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /\.create-side-nav\s+nav\s+a\s*\{[\s\S]*?padding:\s*0\s+var\(--create-side-nav-rail-inset\);[\s\S]*?\}/
    );
    expect(imageCreateCss).toMatch(
      /\.create-side-nav\.is-collapsed\s+\.create-side-nav-profile-wrap\.is-compact,[\s\S]*?\.create-side-nav-profile\.is-compact\s*\{[\s\S]*?width:\s*var\(--create-side-nav-rail-height\);[\s\S]*?height:\s*var\(--create-side-nav-rail-height\);[\s\S]*?justify-content:\s*center;/
    );
    expect(imageCreateCss).toContain(
      '> .create-side-nav-profile-wrap:not(.is-compact),'
    );
  });

  it('uses a calm accessible upgrade treatment in both themes', () => {
    expect(source).toContain("import './CreateSideNavUpgrade.css'");
    expect(sideNavUpgradeCss).toMatch(
      /\.create-side-nav\s+\.create-side-nav-upgrade\s*\{[\s\S]*?border-color:\s*rgba\(22,\s*113,\s*217,\s*0\.16\);[\s\S]*?linear-gradient\(135deg,\s*#f2f7ff\s*0%,\s*#e8f2ff\s*100%\);/
    );
    expect(sideNavUpgradeCss).toMatch(
      /\.create-side-nav\s+\.create-side-nav-upgrade:active\s*\{[\s\S]*?transform:\s*scale\(0\.98\);/
    );
    expect(sideNavUpgradeCss).toContain(
      '.dark .create-side-nav .create-side-nav-upgrade'
    );
    expect(sideNavUpgradeCss).toContain('@media (prefers-contrast: more)');
  });

  it('uses the shared Popover contract for account menus', () => {
    expect(source).toContain('<CreatorAccountMenu');
    expect(source).toContain('placement="sidebar"');
    expect(miniNavSource).toContain('<CreatorAccountMenu');
    expect(miniNavSource).toContain('placement="topbar"');
    expect(accountMenuSource).toContain('<PopoverRoot');
    expect(accountMenuSource).toContain('open={open}');
    expect(accountMenuSource).toContain('<PopoverTrigger asChild>');
    expect(accountMenuSource).toContain('<PopoverContent');
    expect(accountMenuSource).toContain('const HOVER_CLOSE_DELAY = 120');
    expect(accountMenuSource).toContain('onPointerEnter');
    expect(accountMenuSource).toContain('onPointerLeave');
    expect(accountMenuSource).toContain('onOpenAutoFocus');
    expect(accountMenuSource).toContain("openReasonRef.current !== 'keyboard'");
    expect(accountMenuSource).toContain('leadingIcon={');
    expect(accountMenuSource).toContain('trailingIcon={<Menu size={16} />}');
    expect(accountMenuSource).toContain('<SelectRoot');
    expect(accountMenuSource).toContain('creator-account-preference-trigger');
    expect(accountMenuSource).toContain('changeTheme(nextTheme)');
    expect(accountMenuSource).toContain('changeLanguage(nextLanguage)');
    expect(accountMenuSource).toContain('create-side-nav-account-recharge');
    expect(accountMenuSource).not.toContain('<CreditsDisplay');
    expect(source).not.toContain('accountSelectOpen');
    expect(miniNavSource).not.toContain('accountSelectOpen');
    expect(accountMenuSource).not.toContain('role="menuitem"');
    expect(source).not.toContain('create-side-nav-control-select');
    expect(miniNavSource).not.toContain('create-side-nav-control-select');
    expect(imageCreateCss).not.toContain('.create-side-nav-select-wrap::after');
    expect(imageCreateCss).not.toContain('.create-side-nav-select-content');
    expect(accountMenuCss).not.toContain(
      '.create-side-nav-profile-wrap:hover .create-side-nav-profile-popover'
    );
    expect(accountMenuCss).not.toContain(
      '.image-create-mininav-profile-wrap:hover'
    );
    expect(accountMenuCss).not.toContain('is-select-open');
    expect(accountMenuCss).toMatch(
      /@media \(hover:\s*none\),\s*\(pointer:\s*coarse\)[\s\S]*?\.creator-account-preference-trigger\s*\{[\s\S]*?height:\s*44px;[\s\S]*?min-height:\s*44px;/
    );
    expect(accountMenuCss).toMatch(
      /@media \(hover:\s*none\),\s*\(pointer:\s*coarse\)[\s\S]*?:is\(\.create-side-nav-profile-popover,\s*\.image-create-mininav-profile-popover\)[\s\S]*?:is\(a,\s*button\.danger\)\s*\{[\s\S]*?min-height:\s*44px;/
    );
    expect(accountMenuCss).toMatch(
      /\.create-side-nav-profile-popover,[\s\S]*?\.image-create-mininav-profile-popover\s*\{[\s\S]*?--radix-popover-content-available-height/
    );
    expect(accountMenuCss).toMatch(
      /\.create-side-nav-profile-popover\s*\{[\s\S]*?width:\s*var\(--radix-popover-trigger-width\);/
    );
    expect(accountMenuCss).toMatch(
      /\.dark\s+:is\(\.create-side-nav-profile-popover,\s*\.image-create-mininav-profile-popover\)\s*\{[\s\S]*?rgba\(47,\s*39,\s*34,\s*0\.98\)[\s\S]*?#2b2420;[\s\S]*?color:\s*var\(--create-night-text,\s*#ededed\);/s
    );
    expect(imageCreateCss).not.toMatch(
      /\.dark\s+\.create-side-nav-profile-popover,[\s\S]*?background:\s*rgba\(0,\s*0,\s*0,\s*0\.9\)/
    );
    expect(accountMenuSource).not.toContain(
      'create-side-nav-personal-space-item'
    );
    expect(accountMenuCss).not.toContain('create-side-nav-personal-space-item');
  });
});

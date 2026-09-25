import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const frameSource = readFileSync(
  join(
    process.cwd(),
    'src/web/components/image-create/CreateWorkspaceFrame.tsx'
  ),
  'utf8'
);
const promptLibraryRouteSource = readFileSync(
  join(process.cwd(), 'src/web/pages/CreatePromptLibraryPage.tsx'),
  'utf8'
);
const mainSource = readFileSync(
  join(process.cwd(), 'src/web/main.tsx'),
  'utf8'
);

describe('CreateWorkspaceFrame navigation contract', () => {
  it('keeps the creation side navigation but removes the redundant top navigation', () => {
    expect(frameSource).toContain('<CreateSideNav />');
    expect(frameSource).not.toContain('CreatorMiniNav');
    expect(frameSource).toContain("'image-create-page-without-mininav'");
  });

  it('uses non-blocking reward feedback without waiting for legacy onboarding storage', () => {
    expect(frameSource).toContain('<DailyLoginRewardNotice');
    expect(frameSource).not.toContain('hasSeenCreateOnboarding');
    expect(frameSource).not.toContain('create-onboarding-seen');
  });

  it('renders the prompt library inside the create workspace instead of redirecting it', () => {
    expect(promptLibraryRouteSource).toContain('<CreateWorkspaceFrame');
    expect(promptLibraryRouteSource).toContain(
      '<PromptSeoLandingPage workspaceMode />'
    );
    expect(mainSource.replace(/\n\s+/g, '\n')).toContain(
      'path="/zh-CN/prompts"\nelement={<CreatePromptLibraryPage />}'
    );
    expect(mainSource).not.toContain('function CreatePromptsRedirect');
  });
});

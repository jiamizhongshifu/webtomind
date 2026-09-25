import { CreateWorkspaceFrame } from '../components/image-create/CreateWorkspaceFrame';
import { PromptSeoLandingPage } from './PromptSeoLandingPage';

export function CreatePromptLibraryPage() {
  return (
    <CreateWorkspaceFrame className="create-prompts-route">
      <PromptSeoLandingPage workspaceMode />
    </CreateWorkspaceFrame>
  );
}

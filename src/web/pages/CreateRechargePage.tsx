import { CreateWorkspaceShell } from '../components/create-workspace/CreateWorkspaceShell';
import { RechargeRoutePage } from './RechargeRoutePage';

/**
 * Keeps the public recharge URL and checkout return contract intact while
 * presenting the purchase flow inside the creator workspace.
 */
export function CreateRechargePage() {
  return (
    <CreateWorkspaceShell className="create-recharge-page">
      <div className="create-recharge-embedded">
        <RechargeRoutePage embedded />
      </div>
    </CreateWorkspaceShell>
  );
}

export default CreateRechargePage;

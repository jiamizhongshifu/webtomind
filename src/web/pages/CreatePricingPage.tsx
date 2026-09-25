import { Suspense, lazy } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CreateWorkspaceShell } from '../components/create-workspace/CreateWorkspaceShell';
import { PageLoadSkeleton } from '../components/PageLoadSkeleton';

const PricingPage = lazy(() =>
  import('@/workspace/components/PricingPage').then((module) => ({
    default: module.PricingPage
  }))
);

function prefix(pathname: string): '' | '/zh-CN' | '/en-US' {
  return pathname.startsWith('/en-US')
    ? '/en-US'
    : pathname.startsWith('/zh-CN')
      ? '/zh-CN'
      : '';
}

export function CreatePricingPage() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <CreateWorkspaceShell className="create-pricing-page">
      <div className="create-pricing-embedded">
        <Suspense fallback={<PageLoadSkeleton variant="pricing" embedded />}>
          <PricingPage
            embedded
            onClose={() => navigate(`${prefix(location.pathname)}/create`)}
          />
        </Suspense>
      </div>
    </CreateWorkspaceShell>
  );
}

export default CreatePricingPage;

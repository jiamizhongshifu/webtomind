import type { ReactNode } from 'react';
import { CreateWorkspaceFrame } from '../image-create/CreateWorkspaceFrame';
import '../../styles/create-workspace-v2.css';

export function CreateWorkspaceShell({
  children,
  className = ''
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <CreateWorkspaceFrame className={`create-workspace-v2 ${className}`.trim()}>
      {children}
    </CreateWorkspaceFrame>
  );
}

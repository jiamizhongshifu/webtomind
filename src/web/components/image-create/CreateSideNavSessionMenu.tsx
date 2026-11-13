import { useRef, useState } from 'react';
import { ConfirmDialog } from '@/workspace/components/ConfirmDialog';
import { Link } from 'react-router-dom';
import { ArrowRight, MoreHorizontal, Trash2 } from 'lucide-react';
import { IconButton } from '@/shared/ui';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/shared/ui/radix/dropdown-menu';

export interface CreateSideNavSessionMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  href: string;
  sessionTitle: string;
  copy: {
    open: string;
    delete: string;
    deleting: string;
    cancel: string;
    deleteConfirm: string;
  };
  deleting: boolean;
  deleteError: string;
  onDelete: () => Promise<boolean>;
}

// 会话“更多”菜单：只有登录且有会话的用户才会用到，由 CreateSideNav 懒加载，
// 不让 Radix DropdownMenu 进入匿名访客的首屏代码。
export function CreateSideNavSessionMenu({
  open,
  onOpenChange,
  label,
  href,
  sessionTitle,
  copy,
  deleting,
  deleteError,
  onDelete
}: CreateSideNavSessionMenuProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <IconButton
            ref={triggerRef}
            type="button"
            variant="ghost"
            size="sm"
            className="create-side-nav-session-more"
            label={label}
            aria-haspopup="menu"
            aria-expanded={open}
            icon={<MoreHorizontal aria-hidden="true" />}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="create-side-nav-session-menu"
          aria-label={label}
          align="start"
          side="right"
          sideOffset={8}
          collisionPadding={12}
          onCloseAutoFocus={(event) => {
            if (confirmOpen) event.preventDefault();
          }}
        >
          <DropdownMenuItem asChild>
            <Link to={href} onClick={() => onOpenChange(false)}>
              <ArrowRight aria-hidden="true" />
              <span>{copy.open}</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="danger"
            disabled={deleting}
            onSelect={(event) => {
              // 关闭动作菜单，再由系统对话框确认整个会话的删除。
              event.preventDefault();
              onOpenChange(false);
              setConfirmOpen(true);
            }}
          >
            <Trash2 aria-hidden="true" />
            <span>{deleting ? copy.deleting : copy.delete}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        isOpen={confirmOpen}
        title={copy.delete}
        description={[`“${sessionTitle}”`, copy.deleteConfirm, deleteError]
          .filter(Boolean)
          .join('\n')}
        confirmText={deleting ? copy.deleting : copy.delete}
        cancelText={copy.cancel}
        danger
        loading={deleting}
        returnFocusRef={triggerRef}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          void onDelete().then((deleted) => {
            if (deleted) setConfirmOpen(false);
          });
        }}
      />
    </>
  );
}

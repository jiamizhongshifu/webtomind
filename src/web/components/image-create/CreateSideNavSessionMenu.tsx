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
  copy: {
    open: string;
    delete: string;
    deleting: string;
  };
  deleting: boolean;
  deleteError: string;
  onDelete: () => void;
}

// 会话“更多”菜单：只有登录且有会话的用户才会用到，由 CreateSideNav 懒加载，
// 不让 Radix DropdownMenu 进入匿名访客的首屏代码。
export function CreateSideNavSessionMenu({
  open,
  onOpenChange,
  label,
  href,
  copy,
  deleting,
  deleteError,
  onDelete
}: CreateSideNavSessionMenuProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <IconButton
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
            // 删除失败时需要保留菜单展示错误，关闭时机由 onDelete 控制。
            event.preventDefault();
            onDelete();
          }}
        >
          <Trash2 aria-hidden="true" />
          <span>{deleting ? copy.deleting : copy.delete}</span>
        </DropdownMenuItem>
        {deleteError && <p role="alert">{deleteError}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

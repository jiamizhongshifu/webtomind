'use client';

import { HexColorInput, HexColorPicker } from 'react-colorful';

import { cn } from '@/lib/utils';

export interface ColorFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

/**
 * 设计系统取色器：react-colorful 封装，支持 HEX 输入与取色面板。
 * 值始终为 #RRGGBB。
 */
export function ColorField({
  value,
  onChange,
  label,
  className
}: ColorFieldProps) {
  const handleHexChange = (next: string) => {
    // react-colorful 输入框在打字过程中会回调不完整 HEX；
    // 只把合法颜色写回状态，避免画布拿到非法颜色值。
    const normalized = next.trim().replace(/^#/, '').toLowerCase();
    if (!/^[0-9a-f]{6}$/.test(normalized)) return;
    onChange(`#${normalized}`);
  };

  return (
    <div className={cn('grid gap-2.5', className)}>
      {label ? (
        <span className="text-xs font-semibold text-muted-foreground">
          {label}
        </span>
      ) : null}
      <HexColorPicker color={value} onChange={handleHexChange} />
      <div className="flex items-center gap-2">
        <span
          className="size-7 shrink-0 rounded-full border border-border shadow-sm"
          style={{ backgroundColor: value }}
          aria-hidden="true"
        />
        <HexColorInput
          color={value}
          onChange={handleHexChange}
          prefixed
          className="h-8 w-full min-w-0 rounded-lg border border-border bg-transparent px-2.5 text-sm text-popover-foreground outline-none focus:border-[var(--product-action-bg)]"
          aria-label={label}
        />
      </div>
    </div>
  );
}

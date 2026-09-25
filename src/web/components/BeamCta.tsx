import type { ReactNode } from 'react';
import { BorderBeam } from 'border-beam';
import { clsx } from 'clsx';

type BeamCtaProps = {
  children: ReactNode;
  className?: string;
  active?: boolean;
  fullWidth?: boolean;
  radius?: number;
  tone?: 'primary' | 'warm' | 'subtle';
};

export function BeamCta({
  children,
  className,
  active = true,
  fullWidth = false,
  radius = 999,
  tone = 'primary'
}: BeamCtaProps) {
  return (
    <BorderBeam
      active={active}
      borderRadius={radius}
      brightness={1.3}
      className={clsx(
        'beam-cta',
        `beam-cta--${tone}`,
        fullWidth && 'beam-cta--full',
        className
      )}
      colorVariant="colorful"
      size="md"
      strength={active ? 0.7 : 0}
      theme="dark"
    >
      <span className="beam-cta-card">{children}</span>
    </BorderBeam>
  );
}

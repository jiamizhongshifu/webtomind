import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActivationTeachingHint } from '../ActivationTeachingHint';

describe('ActivationTeachingHint', () => {
  it('renders the reference hint with an accessible dismiss action', () => {
    const onClose = vi.fn();
    render(<ActivationTeachingHint hint="reference" onClose={onClose} />);

    expect(
      screen.getByRole('status', { name: '保持一致' })
    ).toHaveTextContent('添加参考图或角色卡');
    fireEvent.click(
      screen.getByRole('button', { name: '关闭一致性提示' })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers the moodboard and history reuse hints with stable copy', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <ActivationTeachingHint hint="moodboard" onClose={onClose} />
    );
    expect(
      screen.getByRole('status', { name: '把素材收进情绪板' })
    ).toBeInTheDocument();

    rerender(<ActivationTeachingHint hint="history" onClose={onClose} />);
    expect(
      screen.getByRole('status', { name: '上次的成果还在' })
    ).toBeInTheDocument();
  });
});

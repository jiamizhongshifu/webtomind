import { createRef, useState } from 'react';
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverContent
} from '../PopoverPrimitives';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog, useUnsavedChanges } from '../Dialog';
import { TextTooltip, TooltipProvider } from '../radix/tooltip';
import { ImageSessionResultCard } from '@/web/components/image-create/ImageSessionResultCard';
import type { CreationSessionHistoryItem } from '@/web/components/image-create/useImageSessionConversation';

function NestedDialogs() {
  const [parent, setParent] = useState(false);
  const [child, setChild] = useState(false);
  return (
    <>
      <button onClick={() => setParent(true)}>Open parent</button>
      <Dialog open={parent} title="Parent" onClose={() => setParent(false)}>
        <button onClick={() => setChild(true)}>Open child</button>
        <Dialog open={child} title="Child" onClose={() => setChild(false)}>
          <button>Child action</button>
        </Dialog>
      </Dialog>
    </>
  );
}

function DirtyForm({ closed }: { closed: () => void }) {
  const [text, setText] = useState('');
  const { requestClose, discardConfirmation } = useUnsavedChanges(
    Boolean(text),
    closed
  );
  return (
    <>
      <Dialog open title="Edit" onClose={requestClose}>
        <input
          aria-label="Draft"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Dialog>
      {discardConfirmation}
    </>
  );
}

describe('floating UI behavior', () => {
  it('closes only the top custom modal and restores the child trigger', async () => {
    render(<NestedDialogs />);
    fireEvent.click(screen.getByText('Open parent'));
    const childTrigger = screen.getByText('Open child');
    childTrigger.focus();
    fireEvent.click(childTrigger);
    await waitFor(() =>
      expect(
        screen
          .getByRole('dialog', { name: 'Child' })
          .contains(document.activeElement)
      ).toBe(true)
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Child' })
      ).not.toBeInTheDocument()
    );
    expect(screen.getByRole('dialog', { name: 'Parent' })).toBeInTheDocument();
    expect(childTrigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    );
  });

  it('does not discard a dirty form when Escape cancels the nested confirmation', async () => {
    const closed = vi.fn();
    render(<DirtyForm closed={closed} />);
    fireEvent.change(screen.getByLabelText('Draft'), {
      target: { value: 'unsaved' }
    });
    await waitFor(() =>
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(
        true
      )
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    const guard = await screen.findByRole('alertdialog');
    await waitFor(() =>
      expect(guard.contains(document.activeElement)).toBe(true)
    );
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
    expect(closed).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Draft')).toHaveValue('unsaved');
  });

  it('keeps tooltip text separate from an enabled action', async () => {
    const action = vi.fn();
    render(
      <TooltipProvider>
        <TextTooltip text="Download original">
          <button onClick={action}>Download</button>
        </TextTooltip>
      </TooltipProvider>
    );
    const trigger = screen.getByRole('button', { name: 'Download' });
    act(() => trigger.focus());
    const tooltip = await screen.findByRole('tooltip');
    expect(trigger).toHaveAttribute('aria-describedby', tooltip.id);
    expect(trigger).not.toHaveAttribute('title');
    fireEvent.click(trigger);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('forwards an enclosing popover trigger action and ref through the tooltip', async () => {
    const triggerRef = createRef<HTMLButtonElement>();
    const action = vi.fn();
    render(
      <TooltipProvider>
        <PopoverRoot>
          <PopoverTrigger asChild ref={triggerRef}>
            <TextTooltip text="Choose a color">
              <button onClick={action}>Color</button>
            </TextTooltip>
          </PopoverTrigger>
          <PopoverContent aria-label="Colors">
            <button>Red</button>
          </PopoverContent>
        </PopoverRoot>
      </TooltipProvider>
    );
    const button = screen.getByRole('button', { name: 'Color' });
    expect(triggerRef.current).toBe(button);
    fireEvent.click(button);
    expect(
      await screen.findByRole('dialog', { name: 'Colors' })
    ).toBeInTheDocument();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('allows disabled explanations to receive focus without enabling the action', async () => {
    const action = vi.fn();
    const { container } = render(
      <TooltipProvider>
        <TextTooltip text="Sign in first">
          <button disabled onClick={action}>
            Generate
          </button>
        </TextTooltip>
      </TooltipProvider>
    );
    const wrapper = container.querySelector(
      'span[tabindex="0"]'
    ) as HTMLElement;
    act(() => wrapper.focus());
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Sign in first'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
  });

  it('requires explicit confirmation, retains a failed delete, and allows retry', async () => {
    const onDelete = vi
      .fn()
      .mockRejectedValueOnce(new Error('Delete failed'))
      .mockResolvedValue(undefined);
    render(
      <ImageSessionResultCard
        item={
          {
            id: 'image-test',
            imageUrl: '/test.png',
            prompt: 'test'
          } as CreationSessionHistoryItem
        }
        prompt="test"
        aspectRatio="1/1"
        onPreview={vi.fn()}
        onDownload={vi.fn()}
        onRegenerate={vi.fn()}
        onDelete={onDelete}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '更多图片操作' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: '删除图片' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Delete failed');
    expect(
      screen.getByRole('dialog', { name: '删除图片' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '删除图片' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: '删除图片' })
      ).not.toBeInTheDocument()
    );
    expect(onDelete).toHaveBeenCalledTimes(2);
  });
});

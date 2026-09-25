import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PromptLibrarySearch } from '../PromptLibrarySearch';

describe('library search interaction isolation', () => {
  it('keeps drafts local and only submits the trimmed query', () => {
    const onSearch = vi.fn();
    const parentRender = vi.fn();
    function Parent() {
      parentRender();
      return <PromptLibrarySearch isZh={false} query="" onSearch={onSearch} />;
    }
    render(<Parent />);
    const initialRenders = parentRender.mock.calls.length;
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: ' portrait ' }
    });
    expect(onSearch).not.toHaveBeenCalled();
    expect(parentRender).toHaveBeenCalledTimes(initialRenders);
    fireEvent.submit(screen.getByRole('search'));
    expect(onSearch).toHaveBeenCalledWith('portrait');
  });

  it('restores URL queries on navigation and supports clearing search', () => {
    const onSearch = vi.fn();
    const { rerender } = render(
      <PromptLibrarySearch
        key="portrait"
        isZh
        query="portrait"
        onSearch={onSearch}
      />
    );
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'draft' }
    });
    rerender(
      <PromptLibrarySearch
        key="product"
        isZh
        query="product"
        onSearch={onSearch}
      />
    );
    expect(screen.getByRole('searchbox')).toHaveValue('product');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(onSearch).toHaveBeenCalledWith('');
  });
});

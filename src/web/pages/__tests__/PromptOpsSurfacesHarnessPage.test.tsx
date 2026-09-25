import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PromptOpsSurfacesHarnessPage } from '../PromptOpsSurfacesHarnessPage';

describe('PromptOpsSurfacesHarnessPage', () => {
  it('renders migrated prompt ops and AI usage surfaces', async () => {
    render(<PromptOpsSurfacesHarnessPage />);

    expect(screen.getByText('Prompt Ops Surfaces')).toBeInTheDocument();
    expect(screen.getByText('素材列表')).toBeInTheDocument();
    expect(screen.getByText('编辑素材')).toBeInTheDocument();
    expect(await screen.findByText('gpt-image-2')).toBeInTheDocument();
  });
});

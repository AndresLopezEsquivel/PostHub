import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as postsApi from '../api/posts';
import { DeletePostButton } from './DeletePostButton';

vi.mock('../api/posts');

describe('DeletePostButton', () => {
  afterEach(() => vi.clearAllMocks());

  it('asks for confirmation before deleting', async () => {
    const user = userEvent.setup();
    render(<DeletePostButton postId={1} onDeleted={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByText('Delete this post?')).toBeInTheDocument();
    expect(postsApi.deletePost).not.toHaveBeenCalled();
  });

  it('cancels without deleting', async () => {
    const user = userEvent.setup();
    render(<DeletePostButton postId={1} onDeleted={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Delete this post?')).not.toBeInTheDocument();
    expect(postsApi.deletePost).not.toHaveBeenCalled();
  });

  it('deletes and calls onDeleted on confirm', async () => {
    vi.mocked(postsApi.deletePost).mockResolvedValue(undefined);
    const onDeleted = vi.fn();
    const user = userEvent.setup();
    render(<DeletePostButton postId={7} onDeleted={onDeleted} />);

    await user.click(screen.getByRole('button', { name: 'Delete' })); // reveal confirm
    await user.click(screen.getByRole('button', { name: 'Delete' })); // confirm

    expect(postsApi.deletePost).toHaveBeenCalledWith(7);
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });
});

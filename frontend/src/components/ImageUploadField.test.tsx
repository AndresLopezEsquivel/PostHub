import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api/client';
import { ImageUploadField } from './ImageUploadField';

// uploadImage is the network boundary; mock it so the field's own lifecycle (preview,
// pending, intent reporting, error) is what's under test. vi.hoisted so the mock fn
// exists when the (hoisted) vi.mock factory runs.
const { uploadImage } = vi.hoisted(() => ({ uploadImage: vi.fn() }));
vi.mock('../api/uploads', () => ({ uploadImage }));

function fileOf(type: string): File {
  return new File([new Uint8Array(4)], 'pic', { type });
}

beforeEach(() => {
  uploadImage.mockReset();
  // jsdom implements neither; the field creates/revokes an object URL for the preview.
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => vi.restoreAllMocks());

describe('ImageUploadField', () => {
  it('uploads on select, previews, and reports the new key', async () => {
    uploadImage.mockResolvedValue('posts/abc.jpg');
    const onChange = vi.fn();
    const onPendingChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ImageUploadField
        label="Image"
        purpose="post"
        onChange={onChange}
        onPendingChange={onPendingChange}
      />,
    );

    await user.upload(screen.getByLabelText('Image'), fileOf('image/jpeg'));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ kind: 'set', key: 'posts/abc.jpg' }),
    );
    expect(screen.getByAltText('Image preview')).toHaveAttribute('src', 'blob:preview');
    // Pending toggled true then back to false.
    expect(onPendingChange).toHaveBeenCalledWith(true);
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
  });

  it('reports removal and clears the existing preview', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ImageUploadField
        label="Avatar"
        purpose="avatar"
        initialUrl="https://cdn.test/old.jpg"
        onChange={onChange}
      />,
    );

    // The existing image shows, so Remove is available.
    expect(screen.getByAltText('Avatar preview')).toHaveAttribute('src', 'https://cdn.test/old.jpg');
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(onChange).toHaveBeenCalledWith({ kind: 'removed' });
    expect(screen.queryByAltText('Avatar preview')).not.toBeInTheDocument();
  });

  it('shows an inline error and does not report a key when the upload fails', async () => {
    uploadImage.mockRejectedValue(new ApiError(415, 'Choose a JPEG, PNG, WebP, or GIF image.', 'image'));
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<ImageUploadField label="Image" purpose="post" onChange={onChange} />);

    await user.upload(screen.getByLabelText('Image'), fileOf('image/tiff'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Choose a JPEG/);
    expect(onChange).not.toHaveBeenCalled();
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('renders an image with an accessible alt when a url is given', () => {
    render(<Avatar url="https://cdn.test/a.jpg" name="andres" />);
    const img = screen.getByRole('img', { name: "andres's avatar" });
    expect(img).toHaveAttribute('src', 'https://cdn.test/a.jpg');
  });

  it('falls back to the name initial when there is no url', () => {
    render(<Avatar url={null} name="carol" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });
});

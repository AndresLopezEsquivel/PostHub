// Loaded by both Vitest projects. Adds jest-dom's matchers (toBeInTheDocument and
// friends) and unmounts anything React Testing Library rendered after each test,
// so a leftover tree can't leak into the next one.
import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

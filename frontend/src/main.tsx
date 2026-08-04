import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';

import { AuthProvider } from './auth/AuthProvider';
import { router } from './routes';

// Order matters: reset neutralises browser defaults, tokens defines the
// vocabulary, base applies it to bare elements. Component styles are CSS Modules
// imported by their own components, so this is the whole global stylesheet story.
import './styles/reset.css';
import './styles/tokens.css';
import './styles/base.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element in index.html');

createRoot(rootElement).render(
  <StrictMode>
    {/* AuthProvider wraps the router rather than sitting inside a route: the nav,
        both guards, and every screen consume it, and it must survive route
        changes without re-running the session probe. */}
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);

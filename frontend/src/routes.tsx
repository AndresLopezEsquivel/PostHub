import { createBrowserRouter, type RouteObject } from 'react-router';

import { AnonymousOnly } from './auth/AnonymousOnly';
import { RequireAuth } from './auth/RequireAuth';
import { NotFound } from './components/NotFound';
import { RootLayout } from './components/RootLayout';
import { RouteError } from './components/RouteError';
import { Bookmarks } from './pages/Bookmarks';
import { CreatePost } from './pages/CreatePost';
import { EditPost } from './pages/EditPost';
import { EditProfile } from './pages/EditProfile';
import { Explore } from './pages/Explore';
import { Feed } from './pages/Feed';
import { FollowList } from './pages/FollowList';
import { Login } from './pages/Login';
import { Notifications } from './pages/Notifications';
import { PostDetail } from './pages/PostDetail';
import { Profile } from './pages/Profile';
import { Register } from './pages/Register';

// Users are addressed by name and everything else by id, hence
// /users/:username but /posts/:postId.
//
// createBrowserRouter is used only for the route table and errorElement, with
// no loaders or actions: screens fetch through src/api, so there is one way to
// load data.
//
// routes and router are exported separately so tests can mount routes with
// createMemoryRouter at any path, while router binds them to browser history
// for main.tsx.
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    // A render error anywhere below replaces the whole layout with RouteError.
    // Errors in event handlers and async code aren't caught, so screens show
    // their own fetch failures.
    errorElement: <RouteError />,
    children: [
      // '/' is Explore, not '/explore': it is the public front door and the only
      // screen an anonymous first-time visitor can meaningfully land on.
      { index: true, element: <Explore /> },

      // /users/:username, not /:username: a bare segment would let a user named
      // "feed" or "login" hide a screen.
      { path: 'users/:username', element: <Profile /> },
      // Two paths, one component: the tab is in the URL so each list can be
      // linked to.
      { path: 'users/:username/followers', element: <FollowList tab="followers" /> },
      { path: 'users/:username/following', element: <FollowList tab="following" /> },

      {
        element: <AnonymousOnly />,
        children: [
          { path: 'login', element: <Login /> },
          { path: 'register', element: <Register /> },
        ],
      },

      {
        element: <RequireAuth />,
        children: [
          { path: 'feed', element: <Feed /> },
          // Static segments outrank dynamic ones, so order doesn't affect matching;
          // posts/new is listed first so the file reads in matching order.
          { path: 'posts/new', element: <CreatePost /> },
          // RequireAuth, not an author-only guard: the author isn't known until the
          // post loads. EditPost then compares usernames, which only affects the UI;
          // the backend's 403 on PATCH is the real check.
          { path: 'posts/:postId/edit', element: <EditPost /> },
          // /settings/profile, not /users/me/edit: /users/:username is the
          // public, username-addressed namespace, and this screen is neither
          // (the API uses PATCH /api/users/me).
          { path: 'settings/profile', element: <EditProfile /> },
          { path: 'notifications', element: <Notifications /> },
          { path: 'bookmarks', element: <Bookmarks /> },
        ],
      },

      { path: 'posts/:postId', element: <PostDetail /> },

      // Nothing matched. Distinct from a 404 on a resource, which is a state of
      // the screen itself. Reachable on a hard refresh only because nginx.conf's
      // try_files answers unknown paths with index.html.
      { path: '*', element: <NotFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);

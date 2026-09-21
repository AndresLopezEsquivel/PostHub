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

// The single place PostHub's URL tree is declared — the frontend twin of
// backend/src/routes/index.ts, and the mapping from docs/screens.md's twelve
// screens to addresses. The doc names screens, not URLs; the canonical table is
// mirrored into docs/screens.md under "Routes".
//
// Two rules drive the naming: mirror the api_design.md paths so a route reads as
// its API call, and honour "users are named, everything else is numbered" — hence
// /users/:username but /posts/:postId.
//
// createBrowserRouter is used for the route table and errorElement ONLY. No
// loaders, no actions: screens fetch through src/api/*, so there is one data
// story rather than two competing ones. Do not half-adopt the data APIs later —
// either commit to them everywhere in one deliberate pass, or not at all.
//
// The table and the browser router are exported separately for the same reason
// backend/src/app.ts is split from server.ts: `routes` is the declaration and can
// be driven by createMemoryRouter in a test at any starting path, while `router`
// binds it to real browser history and is used only by main.tsx.
export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    // docs/screens.md's "Error boundary": a render-time crash anywhere below here
    // is replaced with a fallback so the nav and the rest of the app stay usable.
    // It does NOT catch errors thrown from event handlers or effects — React
    // boundaries never have — so screens still render their own fetch failures.
    errorElement: <RouteError />,
    children: [
      // --- Public ---------------------------------------------------------
      // '/' is Explore, not '/explore': it is the public front door and the only
      // screen an anonymous first-time visitor can meaningfully land on.
      { index: true, element: <Explore /> },

      // /users/:username rather than a bare /:username. A bare segment shares a
      // namespace with every top-level route, so a user registering as "feed" or
      // "login" would shadow a screen — a permanent hazard for a cosmetic gain.
      { path: 'users/:username', element: <Profile /> },
      // Two paths, one component: docs/screens.md calls these "two lists sharing
      // one screen", and putting the tab in the URL makes each list deep-linkable.
      { path: 'users/:username/followers', element: <FollowList tab="followers" /> },
      { path: 'users/:username/following', element: <FollowList tab="following" /> },

      // --- Anonymous only (docs/screens.md §1, §2) -------------------------
      // Guards are layout routes, not per-element wrappers: one instance renders
      // an <Outlet /> for its whole subtree, so the rule is written once and
      // cannot drift between routes.
      {
        element: <AnonymousOnly />,
        children: [
          { path: 'login', element: <Login /> },
          { path: 'register', element: <Register /> },
        ],
      },

      // --- Authenticated ---------------------------------------------------
      {
        element: <RequireAuth />,
        children: [
          { path: 'feed', element: <Feed /> },
          // 'posts/new' before 'posts/:postId'. React Router ranks static
          // segments above dynamic ones, so array order is not load-bearing here
          // — but this is the same hazard backend/src/routes/index.ts handles
          // with "more-specific mounts before general ones", and reading order
          // should not contradict matching order.
          { path: 'posts/new', element: <CreatePost /> },
          // RequireAuth, not an author-only guard: the client cannot know the
          // author until the post loads. The screen compares
          // post.author.username to the session username afterwards. That check
          // is UX; the real gate is the backend's 403 on PATCH.
          { path: 'posts/:postId/edit', element: <EditPost /> },
          // /settings/profile, not /users/me/edit: /users/:username is the
          // public, username-addressed namespace, and this screen is neither
          // (the API uses PATCH /api/users/me).
          { path: 'settings/profile', element: <EditProfile /> },
          { path: 'notifications', element: <Notifications /> },
          { path: 'bookmarks', element: <Bookmarks /> },
        ],
      },

      // Public, and declared after the guarded groups so it only catches what
      // nothing else claimed.
      { path: 'posts/:postId', element: <PostDetail /> },

      // Nothing matched. Distinct from a 404 on a resource, which is a state of
      // the screen itself. Reachable on a hard refresh only because nginx.conf's
      // try_files answers unknown paths with index.html.
      { path: '*', element: <NotFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);

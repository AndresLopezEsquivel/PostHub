# Screens — PostHub

Screen inventory for PostHub. For each screen: the data
it displays, the actions available to the user, the states it can be in, and who may
access it.

---

## Routes

The addresses each screen is reachable at. Declared in `frontend/src/routes.tsx`, which is the
single place the URL tree is built — this table mirrors it.

Two rules drive the naming: mirror the paths in `api_design.md` so a route reads as the API call
behind it, and honour that document's "users are named, everything else is numbered" convention.

| Path | Screen | Access |
| --- | --- | --- |
| `/` | 3. Explore | Public |
| `/login` | 2. Login | Anonymous only |
| `/register` | 1. Register | Anonymous only |
| `/feed` | 4. Feed | Authenticated |
| `/posts/new` | 6. Create post | Authenticated |
| `/posts/:postId` | 5. Post detail | Public |
| `/posts/:postId/edit` | 7. Edit post | Authenticated; author check on load |
| `/users/:username` | 8. Profile | Public |
| `/users/:username/followers` | 10. Followers / following | Public |
| `/users/:username/following` | 10. Followers / following | Public |
| `/settings/profile` | 9. Edit profile | Authenticated (self) |
| `/notifications` | 11. Notifications | Authenticated (self) |
| `/bookmarks` | 12. Bookmarks | Authenticated (self) |
| `*` | Not found | Public |

Notes on the less obvious choices:

- **`/` is Explore**, not `/explore` — it is the public front door and the only screen an
  anonymous first-time visitor can meaningfully land on.
- **`/users/:username`, not a bare `/:username`** — a bare segment shares a namespace with every
  top-level route, so a user registering as `feed` or `login` would shadow a screen.
- **Followers and following are two paths, one screen.** The tab lives in the URL so each list
  deep-links and Back/Forward moves between them, matching the two distinct API endpoints.
- **`/settings/profile`, not `/users/me/edit`** — `/users/:username` is the public,
  username-addressed namespace, and the self-edit screen is neither (the API uses
  `PATCH /api/users/me`).
- **Edit post is gated on authentication, not authorship.** The client cannot know the author
  until the post loads, so the screen compares the post's author to the session user afterwards.
  That check is UX; the real gate is the backend's `403`.

Access here is a *client-side* concern only — it decides what to render and where to redirect.
Every gated action is independently enforced by the API, which is the only authority.

---

## Public / auth screens

### 1. Register

| | |
| --- | --- |
| **Data shown** | Empty form. |
| **Fields** | username, email, password, confirm password |
| **Actions** | Submit · go to Login |
| **States** | Validation errors (email taken, username taken, weak password, mismatched confirm) · submitting |
| **Access** | Anonymous users only. |

### 2. Login

| | |
| --- | --- |
| **Data shown** | Empty form. |
| **Fields** | email (or username), password |
| **Actions** | Submit · go to Register |
| **States** | Invalid credentials error · submitting |
| **Access** | Anonymous users only. |

---

## Core content screens

### 3. Explore — all posts

Every post on the site, from every author.

| | |
| --- | --- |
| **Data shown** | Post cards: title, author name + avatar, excerpt, categories, like count, comment count, created date |
| **Actions** | Like / unlike · bookmark · open post · filter by category · search · sort (newest / most-liked) · paginate · open author profile |
| **States** | Empty · loading · error |
| **Access** | Public. Engagement actions require authentication. |

### 4. Feed — personalized

The same cards as Explore, scoped to posts from authors the user follows.

| | |
| --- | --- |
| **Data shown** | Post cards from followed authors only. |
| **Actions** | Identical to Explore. |
| **States** | Empty ("follow someone to see posts here") · loading · error |
| **Access** | Authenticated users only. |

The empty state is a call to action rather than an absence of content, which makes
it meaningfully different from Explore's.

### 5. Post detail

| | |
| --- | --- |
| **Data shown** | Full post: title, body, author, categories, like count, created / edited timestamps, comments list |
| **Actions** | Like / unlike · bookmark · follow author · add comment · edit post *(author only)* · delete post *(author only)* · delete comment *(own only)* |
| **States** | Post not found · loading · error |
| **Access** | Public to read. Writing requires authentication; editing and deleting require ownership. |

### 6. Create post

| | |
| --- | --- |
| **Fields** | title, body, category multi-select, image upload |
| **Actions** | Submit · cancel |
| **States** | Validation errors · submitting · upload progress |
| **Access** | Authenticated users only. |

Posts are published on submit.

### 7. Edit post

| | |
| --- | --- |
| **Data shown** | Form pre-filled with the existing post. |
| **Actions** | Save · delete · cancel |
| **States** | Post not found · loading · validation errors · submitting |
| **Access** | Author only. |

---

## User screens

### 8. Profile

One screen with two modes: viewing your own profile or another user's. The mode
changes which actions appear, not which data loads.

| | |
| --- | --- |
| **Data shown** | Avatar, username, bio, join date, post count, follower count, following count, their posts |
| **Actions** | Follow / unfollow *(other users only)* · edit profile *(self only)* · open a post · open followers / following lists |
| **States** | User not found · no posts yet · loading |
| **Access** | Public. Following requires authentication. |

### 9. Edit profile

| | |
| --- | --- |
| **Fields** | bio, avatar upload · optionally email / password change |
| **Actions** | Save · cancel |
| **States** | Validation errors · submitting · upload progress |
| **Access** | Self only. |

### 10. Followers / following

Two lists sharing one screen.

| | |
| --- | --- |
| **Data shown** | User list: avatar, username, bio snippet |
| **Actions** | Follow / unfollow each · open profile |
| **States** | Empty · loading |
| **Access** | Public. Following requires authentication. |

---

## Engagement screens

### 11. Notifications

| | |
| --- | --- |
| **Data shown** | List: actor, action type (liked / commented / followed), target post, timestamp, read / unread |
| **Actions** | Mark read · mark all read · open the source post or profile |
| **States** | Empty · loading · unread badge in navigation |
| **Access** | Self only. |

### 12. Bookmarks

| | |
| --- | --- |
| **Data shown** | Saved posts — the same cards as Explore. |
| **Actions** | Unbookmark · open post |
| **States** | Empty · loading |
| **Access** | Self only. |

---

## Cross-cutting surfaces

Not screens, but surfaces every screen depends on.

### Navigation bar

- **Authenticated:** logo · Feed · Explore · search · notifications bell (with unread
  badge) · avatar menu (Profile, Bookmarks, Create post, Logout)
- **Anonymous:** logo · Explore · search · Login · Register

### Not found

Shown when the requested address matches no screen. Distinct from a missing
resource, such as a deleted post, which is a state of the screen itself.

### Error boundary

A fallback surface shown when a screen fails unexpectedly, so the rest of the
application stays usable.

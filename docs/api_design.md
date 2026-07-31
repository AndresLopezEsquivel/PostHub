# API design — PostHub

REST API for PostHub, a multi-user posting application. Paths are noun-based; HTTP
methods carry the action.

**Base path:** `/api`
**Transport:** the client only ever addresses the frontend origin. The frontend
server proxies `/api/*` to this backend, so no host or port appears in client code.

**Notation used below:** `→` is the request, `←` is the response. Examples are
trimmed for readability — long fields are elided with `…`.

---

## Conventions

### Identifiers

| Resource | Identifier | Example |
| --- | --- | --- |
| Users | `username` | `/api/users/andres` |
| Posts | numeric `id` | `/api/posts/42` |
| Comments | numeric `id` | `/api/comments/17` |
| Notifications | numeric `id` | `/api/notifications/91` |

**Rule of thumb: users are named, everything else is numbered.**

### Authentication

Session-based. The session cookie is sent automatically by the browser and forwarded
by the proxy in both directions. Endpoints marked **auth** reject unauthenticated
requests with `401`.

### Status codes

| Code | Meaning |
| --- | --- |
| `200` | OK |
| `201` | Created |
| `204` | No content — successful `DELETE`, or an idempotent `PUT` that changed nothing |
| `400` | Validation failure — malformed or missing fields |
| `401` | Not authenticated — no valid session |
| `403` | Authenticated, but not the owner of the resource |
| `404` | Resource does not exist |
| `409` | Conflict — e.g. username or email already taken |

`401` and `403` are distinct and worth keeping honest: `401` means *"we don't know
who you are"*, `403` means *"we know exactly who you are, and you may not do this"*.

### Error shape

Every error returns the same JSON envelope, so the client has one path to handle:

```
← 400 { "error": { "message": "Title is required", "field": "title" } }
```

### Pagination

List endpoints accept `?page=` and `?limit=` and return a consistent envelope:

```
← 200 {
    "data": [ … ],
    "page": 1,
    "limit": 20,
    "total": 137
  }
```

### Shared object shapes

Referenced throughout as `<user>`, `<postCard>`, and `<comment>`.

```
<user>      { "username": "andres", "avatarUrl": "https://…/a7.jpg" }

<postCard>  { "id": 42,
              "title": "On absurdism",
              "excerpt": "Camus opens with…",
              "author": <user>,
              "categories": [{ "name": "Philosophy", "slug": "philosophy" }],
              "likeCount": 12,
              "commentCount": 3,
              "likedByMe": true,
              "bookmarkedByMe": false,
              "createdAt": "2026-07-14T10:22:31Z" }

<comment>   { "id": 17,
              "content": "Great read.",
              "author": <user>,
              "createdAt": "2026-07-14T11:02:09Z",
              "updatedAt": null }
```

`likedByMe` and `bookmarkedByMe` are `false` for anonymous callers.

---

## Auth

| Method | Path | Handler | Auth | Description |
| --- | --- | --- | --- | --- |
| `POST` | `/api/auth/register` | `registerUser` | — | Creates a user, hashes the password, opens a session. |
| `POST` | `/api/auth/login` | `loginUser` | — | Verifies credentials and opens a session. |
| `POST` | `/api/auth/logout` | `logoutUser` | auth | Destroys the session and clears the cookie. |
| `GET` | `/api/auth/session` | `getSession` | — | Returns the current user, or `401` if none. |

```
POST /api/auth/register
→ { "username": "andres", "email": "andres@example.com", "password": "…" }
← 201 { "username": "andres", "email": "andres@example.com" }
← 409 { "error": { "message": "Username already taken", "field": "username" } }

POST /api/auth/login
→ { "email": "andres@example.com", "password": "…" }
← 200 { "username": "andres", "email": "andres@example.com" }
← 401 { "error": { "message": "Invalid credentials" } }

POST /api/auth/logout
→ (no body)
← 204

GET /api/auth/session
→ (no body — cookie identifies the user)
← 200 { "username": "andres", "email": "andres@example.com" }
← 401 { "error": { "message": "Not authenticated" } }
```

`getSession` is what the React app calls on mount to learn whether it is logged in.
It returns `401` rather than `200 { user: null }` so that the client's auth check and
its error handling follow the same path.

`registerUser` returns `409` when the username or email is taken — not `400`. The
request was well-formed; it conflicts with existing state.

No endpoint ever returns `password_hash`.

---

## Posts

| Method | Path | Handler | Auth | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/api/posts` | `listPosts` | — | Explore. Public, paginated, filterable. |
| `POST` | `/api/posts` | `createPost` | auth | Creates a post authored by the session user. |
| `GET` | `/api/posts/:postId` | `getPost` | — | Post detail. |
| `PATCH` | `/api/posts/:postId` | `updatePost` | auth · owner | Partial update. `403` if not the author. |
| `DELETE` | `/api/posts/:postId` | `deletePost` | auth · owner | `403` if not the author. |

### `listPosts` query parameters

| Param | Values | Description |
| --- | --- | --- |
| `search` | free text | Matches title and content. |
| `category` | category `slug` | Filters by category. |
| `sort` | `newest` \| `likes` | Defaults to `newest`. |
| `page` | integer | Defaults to `1`. |
| `limit` | integer | Defaults to `20`. |

An absent filter param passes all records through — it is not an error.

```
GET /api/posts?category=philosophy&sort=likes&page=1&limit=20
→ (no body)
← 200 { "data": [ <postCard>, … ], "page": 1, "limit": 20, "total": 137 }

POST /api/posts
→ { "title": "On absurdism", "content": "Camus opens with…",
    "categoryIds": [3, 8], "imageKey": null }
← 201 <postCard>
← 400 { "error": { "message": "Title is required", "field": "title" } }

GET /api/posts/42
→ (no body)
← 200 { …<postCard>, "content": "Camus opens with…", "imageKey": null, "updatedAt": null }
← 404 { "error": { "message": "Post not found" } }

PATCH /api/posts/42
→ { "title": "On absurdism, revisited" }
← 200 <postCard>
← 403 { "error": { "message": "You are not the author of this post" } }

DELETE /api/posts/42
→ (no body)
← 204
```

`getPost` returns the same shape as `<postCard>` plus the full `content`; the list
endpoint sends `excerpt` only. Detail also carries `imageKey` and `updatedAt` (both
absent from the list card): the Edit-post screen pre-fills from the current image
`key`, and Post detail shows an "edited" timestamp. `updatedAt` is `null` until the
post is first edited.

`createPost` takes `categoryIds`, not category names — the client already holds the
list from `GET /api/categories`.

`PATCH` accepts any subset of `title`, `content`, `categoryIds`, `imageKey`.

---

## Feed

| Method | Path | Handler | Auth | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/api/feed` | `getFeed` | auth | Posts authored by users the session user follows. |

```
GET /api/feed?page=1&limit=20
→ (no body)
← 200 { "data": [ <postCard>, … ], "page": 1, "limit": 20, "total": 24 }
← 401 { "error": { "message": "Not authenticated" } }
```

Identical response shape to `listPosts`, so the client reuses one card renderer.
An empty `data` array means "follow someone", not "no posts exist" — the screen
distinguishes them.

Top-level rather than `/api/posts?feed=true`: it has different auth rules and a
different underlying query. Encoding it as a filter would hide that.

---

## Likes

| Method | Path | Handler | Auth | Description |
| --- | --- | --- | --- | --- |
| `PUT` | `/api/posts/:postId/like` | `likePost` | auth | Idempotent. Liking twice is not an error. |
| `DELETE` | `/api/posts/:postId/like` | `unlikePost` | auth | Idempotent. Unliking an unliked post is not an error. |

```
PUT /api/posts/42/like
→ (no body)
← 200 { "postId": 42, "likeCount": 13, "likedByMe": true }

DELETE /api/posts/42/like
→ (no body)
← 200 { "postId": 42, "likeCount": 12, "likedByMe": false }
```

Returning the updated count lets the client render the new state without refetching
the post.

---

## Comments

| Method | Path | Handler | Auth | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/api/posts/:postId/comments` | `listPostComments` | — | Comments for one post, paginated. |
| `POST` | `/api/posts/:postId/comments` | `createComment` | auth | Adds a comment to the post. |
| `PATCH` | `/api/comments/:commentId` | `updateComment` | auth · owner | `403` if not the author. |
| `DELETE` | `/api/comments/:commentId` | `deleteComment` | auth · owner | `403` if not the author. |

```
GET /api/posts/42/comments?page=1&limit=20
→ (no body)
← 200 { "data": [ <comment>, … ], "page": 1, "limit": 20, "total": 3 }

POST /api/posts/42/comments
→ { "content": "Great read." }
← 201 <comment>

PATCH /api/comments/17
→ { "content": "Great read — thanks for writing it." }
← 200 <comment>

DELETE /api/comments/17
→ (no body)
← 204
```

There is no `GET /api/comments/:commentId`. Comments always load as a list belonging
to a post, and no screen displays one in isolation. It would only become necessary
for deep-linking to a single comment.

---

## Bookmarks

| Method | Path | Handler | Auth | Description |
| --- | --- | --- | --- | --- |
| `PUT` | `/api/posts/:postId/bookmark` | `bookmarkPost` | auth | Idempotent. |
| `DELETE` | `/api/posts/:postId/bookmark` | `unbookmarkPost` | auth | Idempotent. |
| `GET` | `/api/bookmarks` | `listBookmarks` | auth | The session user's saved posts. |

```
PUT /api/posts/42/bookmark
→ (no body)
← 200 { "postId": 42, "bookmarkedByMe": true }

DELETE /api/posts/42/bookmark
→ (no body)
← 200 { "postId": 42, "bookmarkedByMe": false }

GET /api/bookmarks?page=1&limit=20
→ (no body)
← 200 { "data": [ <postCard>, … ], "page": 1, "limit": 20, "total": 8 }
```

No `bookmarkCount` is returned — bookmarks are private, so a public tally would leak
information the UI never shows.

`GET /api/bookmarks` is scoped to the session user by definition. There is no path
for reading anyone else's.

---

## Users and follows

| Method | Path | Handler | Auth | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/api/users/:username` | `getUserProfile` | — | Public profile: bio, avatar, join date, counts. |
| `PATCH` | `/api/users/me` | `updateOwnProfile` | auth | Updates bio, avatar, email, or password. |
| `GET` | `/api/users/:username/posts` | `listUserPosts` | — | Posts authored by that user, paginated. |
| `GET` | `/api/users/:username/followers` | `listFollowers` | — | Users following them. |
| `GET` | `/api/users/:username/following` | `listFollowing` | — | Users they follow. |
| `PUT` | `/api/users/:username/follow` | `followUser` | auth | Idempotent. `400` on self-follow. |
| `DELETE` | `/api/users/:username/follow` | `unfollowUser` | auth | Idempotent. |

```
GET /api/users/andres
→ (no body)
← 200 { "username": "andres",
        "bio": "Reading and building.",
        "avatarUrl": "https://…/a7.jpg",
        "createdAt": "2026-01-08T09:14:00Z",
        "postCount": 12,
        "followerCount": 34,
        "followingCount": 19,
        "followedByMe": false }
← 404 { "error": { "message": "User not found" } }

PATCH /api/users/me
→ { "bio": "Reading, building, occasionally sleeping." }
← 200 { "username": "andres", "bio": "Reading, building, occasionally sleeping.", … }
← 400 { "error": { "message": "Username cannot be changed", "field": "username" } }

GET /api/users/andres/posts?page=1&limit=20
← 200 { "data": [ <postCard>, … ], "page": 1, "limit": 20, "total": 12 }

GET /api/users/andres/followers?page=1&limit=20
← 200 { "data": [ { …<user>, "bio": "Reading and building." }, … ],
        "page": 1, "limit": 20, "total": 34 }

PUT /api/users/andres/follow
→ (no body)
← 200 { "username": "andres", "followedByMe": true, "followerCount": 35 }
← 400 { "error": { "message": "You cannot follow yourself" } }

DELETE /api/users/andres/follow
→ (no body)
← 200 { "username": "andres", "followedByMe": false, "followerCount": 34 }
```

`followedByMe` is the profile's viewer-relative field, and is `false` for anonymous
callers. `listFollowing` mirrors `listFollowers` exactly.

`PATCH /api/users/me` **rejects `username` in the body with `400`** — it is not
silently ignored. Usernames are immutable (see Design decisions), and a silent drop
would hide a client bug.

`followUser` returns `400` if the target is the session user, mirroring the
`CHECK (follower_id <> followee_id)` constraint in the database. The database is the
last line of defence; the API should fail earlier and more clearly.

---

## Categories

| Method | Path | Handler | Auth | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/api/categories` | `listCategories` | — | All categories. Populates the filter control and the post form's multi-select. |

```
GET /api/categories
→ (no body)
← 200 [ { "id": 3, "name": "Philosophy", "slug": "philosophy" },
        { "id": 8, "name": "Fiction", "slug": "fiction" } ]
```

Read-only, and unpaginated — the set is small and seeded. Categories are reference
data, not user-generated content.

---

## Notifications

| Method | Path | Handler | Auth | Description |
| --- | --- | --- | --- | --- |
| `GET` | `/api/notifications` | `listNotifications` | auth | The session user's notifications. `?unread=true` filters to unread. |
| `PATCH` | `/api/notifications/:notificationId` | `markNotificationRead` | auth · owner | Sets `is_read`. |
| `POST` | `/api/notifications/read-all` | `markAllRead` | auth | Marks every notification read. |

```
GET /api/notifications?unread=true&page=1&limit=20
→ (no body)
← 200 { "data": [
          { "id": 91, "type": "like", "actor": <user>,
            "post": { "id": 42, "title": "On absurdism" },
            "isRead": false, "createdAt": "2026-07-15T18:40:12Z" },
          { "id": 90, "type": "follow", "actor": <user>,
            "post": null,
            "isRead": false, "createdAt": "2026-07-15T17:05:44Z" }
        ],
        "page": 1, "limit": 20, "total": 2, "unreadCount": 2 }

PATCH /api/notifications/91
→ { "isRead": true }
← 200 { "id": 91, "isRead": true }

POST /api/notifications/read-all
→ (no body)
← 200 { "unreadCount": 0 }
```

`post` is `null` for `follow` notifications — the API-level echo of the nullable
`post_id` column. `unreadCount` rides along on the list response so the navbar badge
needs no second request.

---

## Uploads and health

| Method | Path | Handler | Auth | Description |
| --- | --- | --- | --- | --- |
| `POST` | `/api/uploads/presign` | `createUploadUrl` | auth | Returns a presigned S3 `PUT` URL and the object key. |
| `GET` | `/api/health` | `healthCheck` | — | Liveness check for deployment and monitoring. |

```
POST /api/uploads/presign
→ { "contentType": "image/jpeg", "purpose": "post" }
← 200 { "uploadUrl": "https://s3…/posts/9f2c.jpg?X-Amz-Signature=…",
        "key": "posts/9f2c.jpg",
        "expiresIn": 300 }

GET /api/health
→ (no body)
← 200 { "status": "ok", "database": "ok" }
```

The client `PUT`s the image bytes straight to `uploadUrl`, then submits the returned
`key` as `imageKey` on the post or profile. The bytes never pass through this backend.

`purpose` is `post` or `avatar`; it determines the key prefix.

---

## Design decisions

### `PUT` and `DELETE` for likes, bookmarks, and follows

These are not `POST`. Each of these relationships is a row in a join table that
either exists or does not — there is no "create a second like". `PUT` is idempotent,
so a double-clicked heart is harmless rather than a duplicate-key error.

The HTTP semantics mirror the composite primary keys in the schema exactly: `PUT` is
"ensure this row exists", `DELETE` is "ensure it does not".

### `PATCH` rather than `PUT` for updates

Updates are partial — the client sends only the fields that changed. `PUT` implies
full replacement, which would require the client to send every field on every edit
and risks silently blanking anything omitted.

### Toggle endpoints return the new state

`PUT /api/posts/42/like` responds with `likeCount` and `likedByMe` rather than `204`.
The client updates the heart and the counter from the response alone, with no
refetch and no guessing.

### Nested versus top-level paths

Nest a resource when it is only meaningful inside its parent:

```
POST /api/posts/42/comments     → "add a comment to post 42"
```

Go top-level once the resource has a globally unique id of its own:

```
PATCH /api/comments/17          → the post id adds nothing here
```

Both appear in this API deliberately. Comments are created and listed through their
post, then addressed directly once they exist.

### `/api/users/me`

A stable alias for "the session's user", so the client never needs to know its own
username to update its profile. It also keeps the self-only write path
(`PATCH /api/users/me`) structurally separate from the public read path
(`GET /api/users/:username`), which makes the authorization rule obvious from the
route alone.

### `read-all` is a `POST`

`POST /api/notifications/read-all` is an action, not a resource — the one deliberate
deviation from strict REST in this API. The alternative
(`PATCH /api/notifications` with a body meaning "all of them") is more RESTful in
form and less clear in practice.

### Users are addressed by username

`/api/users/andres` rather than `/api/users/7`. The trade-off is real but not the one
it appears to be:

- **Not a performance cost.** `username` carries a `UNIQUE` constraint, which
  Postgres backs with a B-tree index — the same structure as the primary key. Both
  are `O(log n)` index lookups. Comparing a short string instead of an integer is
  negligible.
- **The real cost is link stability.** A renamed username breaks every existing link
  to that profile; a numeric id never changes.

Readable URLs won, and the cost was removed rather than accepted — see below.

### Usernames are immutable

Set once at registration, never changed. This is what makes username-addressed URLs
permanently stable: `/users/andres` resolves forever.

Consequences:

- The edit-profile surface covers bio, avatar, email, and password — not username.
- `PATCH /api/users/me` returns `400` if the body contains `username`.
- Registration should make the permanence clear in the UI, since the choice is final.

### Authorization is ownership-based

There are no roles. Every write to an existing resource asks one question: *does the
session user own this row?* Ownership is checked against `author_id`; failure returns
`403`.

This keeps the guard uniform across posts, comments, and profiles. Introducing roles
later extends the condition ("is it mine **or** am I a moderator?") rather than
replacing it.

### Viewer-relative state is part of the response

Post responses include `likedByMe` and `bookmarkedByMe`, not just `likeCount` and
`commentCount`. The card UI renders a filled or empty heart, which is a per-user
existence check — a question aggregate counts cannot answer.

This is the API-layer consequence of modelling likes and bookmarks as join tables
rather than integer columns.

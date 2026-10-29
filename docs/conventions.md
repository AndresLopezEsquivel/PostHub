# PostHub's conventions

The rules PostHub's code follows, and the reasons behind them.

## Code comments

A comment costs something: it has to be read, and it has to be kept true
whenever the code around it changes. The code already shows *what* it does,
so a comment only earns its place when it explains something the code
cannot: *why* it is written this way.

* **Keep** a comment when it explains:
  * a non-obvious reason, such as why a simpler approach was rejected;
  * a security or correctness constraint that a future change could break;
  * a directive that a tool reads, such as
    `// eslint-disable-next-line react-hooks/exhaustive-deps`.
* **Remove** a comment when it:
  * restates what the next lines do;
  * points to a document outside the repository, or to one that no longer
    exists;
  * describes how the code was built ("step 4", "for now", "stubbed until
    later") instead of how it works now.
* **Write** every kept comment in plain language, one idea per comment,
  next to the line it explains.

**PostHub's choice:** design reasoning that is longer than a few lines, or
that spans several files, goes in `docs/` instead of a comment, where it can
be read in one place.

### Examples

A comment that restates the code and points to a deleted document. It is
removed:

```ts
// docs/screens.md §4 - personalized feed. Authenticated only (route under
// RequireAuth). The same cards as Explore, scoped to followed authors.
```

The route already sits under `RequireAuth`, and the component already
renders the cards, so the comment adds nothing.

A comment with a real reason, rewritten to be shorter. It is kept:

```ts
// Before
// Signs the session cookie. The fallback is a THROWAWAY for local dev only,
// same rationale as the committed posthub/posthub DB creds: it unlocks nothing
// real. When deployment gets real, set a strong SESSION_SECRET from a
// git-ignored .env (see CLAUDE.md); rotating it invalidates all sessions.

// After
// The fallback is for local development only. Production must set
// SESSION_SECRET; changing it signs every user out.
```

A tool directive with its reason. It is kept as it is:

```ts
// fetcher is intentionally omitted: callers pass an inline closure that is a new
// reference each render, so the explicit `deps` (plus nonce) are the real inputs.
// eslint-disable-next-line react-hooks/exhaustive-deps
```

Resources to dive deeper into:
* [Best practices for writing code comments](https://stackoverflow.blog/2021/12/23/best-practices-for-writing-code-comments/) (Stack Overflow blog)
* [Google TypeScript Style Guide: Comments and documentation](https://google.github.io/styleguide/tsguide.html#comments-documentation)
* [PostgreSQL: Comments](https://www.postgresql.org/docs/current/sql-syntax-lexical.html#SQL-SYNTAX-COMMENTS)

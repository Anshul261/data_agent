# Auth Migration Notes — Toward Keycloak / Entra ID

Status: **not started.** This describes how to reshape the current
hand-rolled auth so that adopting an OIDC provider is a configuration
change rather than a rewrite. Nothing here has been implemented.

The current design is documented in `AUTH_LOG.md`. This file is the
forward-looking companion to it.

---

## 0. The blocker to resolve first

Agno validates the JWT **twice**:

1. `JWTMiddleware` from `agno.os.middleware.jwt`, configured in `agent.py`
   with `secret_key=JWT_SECRET` and `algorithm=JWT_ALGORITHM`.
2. An **internal `python-jose` re-check on every agent run**, which project
   code does not configure. See `AUTH_LOG.md:118` — it is strict enough
   about `iat` that tokens must be backdated 30 seconds to survive it.

A single static HS256 secret is what lets both validators work off one
piece of configuration without forking Agno, and the auth design treats
"no Agno internals modified" as a hard constraint.

Keycloak and Entra both sign with **RS256 using rotating keys published at
a JWKS endpoint**. So the question is not just whether `JWTMiddleware`
accepts a JWKS URL — it is whether that second, unconfigured validator
does too.

**Spike this before estimating anything else.** Concretely: point
`JWTMiddleware` at an RS256 key, issue a provider-signed token, and run an
actual agent turn (not just a `/sessions` read) to exercise the internal
validator.

Outcomes:

- **Both accept RS256/JWKS** — proceed with the plan below.
- **Only the middleware does** — you need a custom middleware that
  validates against JWKS and re-issues a short-lived internally-signed
  HS256 token for Agno's benefit. Workable, but it is real code that must
  be maintained.
- **Neither does** — fall back to configuring the Keycloak client to sign
  with HS256 via its client secret. This drops into today's config
  unchanged, but gives the backend a key that can also *mint* tokens,
  surrendering a good part of the benefit. Treat as a bridge, not a
  destination.

---

## 1. Identity: keep a local mapping table

Today `users.id` (a Postgres UUID) *is* the identity. It becomes the JWT
`sub`, and three things key off it:

| Consumer | Column / behavior |
|---|---|
| `saved_dashboards` | `owner_user_id UUID REFERENCES users(id)` |
| `charts` | `owner_user_id VARCHAR(36)` |
| Agno sessions | filters every query by `user_id` = `sub` |

If `sub` becomes the provider's identifier, all three orphan silently —
existing dashboards, charts, and chat history become invisible to their
owners. **This is the migration's main data risk.**

Do **not** repoint those columns at the provider's ID. Instead keep `users`
as a local profile/mapping table:

```sql
ALTER TABLE users ADD COLUMN provider_sub TEXT UNIQUE;
ALTER TABLE users ADD COLUMN provider     TEXT;  -- 'keycloak' | 'entra'
ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL;
```

On each login, look up the local user by `provider_sub`, creating the row
on first sight (JIT provisioning). Everything downstream keeps using the
local `users.id`, so no existing data moves.

Backfill for existing accounts is a one-time `UPDATE users SET
provider_sub = :sub WHERE username = :username`, matching on whatever
attribute the provider exposes (Keycloak `preferred_username`, Entra
`upn`). Do this **before** cutover, while both systems are readable.

Note the shape difference: Keycloak's `sub` is a plain UUID, Entra's `oid`
is a GUID, but Auth0-style providers emit `auth0|abc123`. Type
`provider_sub` as `TEXT`, not `UUID`, so the column does not constrain
which provider you can adopt later.

---

## 2. Scopes: stop deciding them in the handler

`agent.py` currently hardcodes the scope list in `/auth/login`:

```python
scopes = ([...admin list...] if user["role"] == "admin" else [...user list...])
```

Both providers can emit this as a signed claim instead:

- **Keycloak** — define client roles, then add a protocol mapper that
  writes them into a `scopes` claim. `JWTMiddleware` is already configured
  with `scopes_claim="scopes"`, so this needs no backend change.
- **Entra** — use app roles; they arrive in `roles`. Either set
  `scopes_claim="roles"` or map role names to scopes on the way in.

`_require_scope()` keeps working unchanged either way — that helper is
already provider-agnostic and is the piece worth preserving as-is.

---

## 3. What gets deleted

Once the provider is authoritative, remove:

| Code | Replaced by |
|---|---|
| `POST /auth/login` | Provider's authorization-code flow |
| `POST /auth/bootstrap` | Provider's admin console |
| `POST /auth/recover` | Provider's forgot-password flow |
| `AuthRateLimitMiddleware` | Provider brute-force detection |
| `generate_token()` | Provider token endpoint |
| `auth.py` password functions | Provider credential store |
| `login/page.tsx` + recovery UI | Provider-hosted login page |

Do **not** pre-emptively invest in these before the spike lands. Hardening
the recovery endpoint or moving the rate limiter to Redis is wasted effort
if the whole surface is about to be deleted.

Keep: `_require_scope`, `_get_authenticated_claims`, `UserContextMiddleware`,
and the `users` table (now a mapping table).

---

## 4. Frontend

`login/page.tsx` currently POSTs credentials and stores the returned token
in Zustand. Under OIDC the browser must never see credentials.

- Use the authorization-code flow **with PKCE**. NextAuth has a Keycloak
  provider and an Entra provider; `oidc-client-ts` is the lighter option.
- The `useAuthGuard` hook and the `Authorization: Bearer` header in
  `api/os.ts` stay as they are — only the token's origin changes.
- This is also the moment to fix the refresh-logout problem. `store.ts`
  deliberately does not persist the token (see `AGENTS.md`), which is
  correct for a long-lived one but means every reload bounces to login.
  Short-lived access token + refresh token solves both at once.
- `useAuthedImage` keeps working unchanged — it only needs *a* bearer
  token, not a particular issuer.

---

## 5. Suggested order

1. Spike the double-validator question (§0). Everything depends on it.
2. Add `provider_sub` / `provider` to `users`; deploy; backfill.
3. Register the client; define roles; confirm the `scopes` claim shape.
4. Swap the frontend to the auth-code + PKCE flow behind a feature flag.
5. Cut over. Verify an agent run, a dashboard refresh, and a chart image
   still work — those exercise the internal validator, the ownership
   columns, and `UserContextMiddleware` respectively.
6. Delete the code in §3.

---

## 6. Verification checklist

The failure modes here are quiet, so check data visibility explicitly:

- [ ] An agent turn completes (exercises Agno's internal validator)
- [ ] Pre-existing chat sessions are still visible to their original owner
- [ ] Pre-existing dashboards are still listed by `/api/dashboards`
- [ ] Pre-existing chart images still render in chat history
- [ ] A second user cannot see the first user's dashboards or charts
- [ ] Logout actually invalidates (the current build cannot revoke)
- [ ] Token refresh works without bouncing the user to `/login`

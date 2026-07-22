# OGTrack Frontend (Path A — adapted for Azure SQL backend)

This is your original `index.html`, adapted to talk to the new multi-tenant
Azure SQL backend **without** rewriting its 111 API calls. A small adapter shim
(injected near the top of the file) intercepts every `/api/...` request and:

1. Detects the tenant **slug** from the URL (`/ogtrack` → `ogtrack`).
2. Rewrites `/api/<x>` → `/api/<slug>/<x>` automatically.
3. Remaps the paths whose shape changed on the backend:
   - accounting (`/clients`, `/time-entries`, `/eod-reports`, `/eod-routes`) → `/api/<slug>/acc/...`
   - HR (`/jobs`, `/candidates`, `/interviews`) → `/api/<slug>/hr/...`
   - leave (`/leave`) → `/api/<slug>/attendance/leave`
4. Attaches the login **JWT** as `Authorization: Bearer <token>` on every call.

It also patches: the login handler (new `{token, user}` response), logout
(clears the token), and the Socket.io setup (points at the API base and joins
the tenant's real-time room).

## Running it locally

You need the **backend running first** (see the backend's README — `npm start`,
confirm `/health` returns ok). Then, in this folder:

```
node serve.js
```

Open a tenant in your browser:
```
http://localhost:8080/ogtrack     ← loads OGTrack, talks to OGTrack_prod
http://localhost:8080/cajo        ← loads Cajo, talks to OGTrack_cajo
```

The slug in the URL is what selects the tenant — same page, different backend
database, entirely driven by the adapter.

## Logging in

Use an account that exists in that tenant's database with `status='active'`.
For the Alice test account you created:
```sql
-- against OGTrack_prod, make her active first:
UPDATE dbo.users SET status='active' WHERE email='alice@ogtrack.test';
```
Then log in at `http://localhost:8080/ogtrack` with `alice@ogtrack.test` / `Test@1234`.

## Configuring the backend URL

The adapter defaults to `http://localhost:3000` for local dev. When you deploy,
set the real API origin before the app loads, e.g. add this ONE line just after
the `<head>` tag:
```html
<script>window.OGTRACK_API_BASE='https://your-api.azurewebsites.net';</script>
```

## Known Path-A limitations (fine for now, worth knowing)

- **File uploads** write to the backend's local disk. Works locally; on Azure
  App Service that disk is wiped on restart/scale — move to Azure Blob later.
- This is still the single big `index.html`, not a framework rebuild. That's the
  intentional Path-A tradeoff: fastest route to a working app. Path B (React/Vite
  split) remains available later as a clean-up.
- Some UI elements referencing the old `COMPANY_CONTEXT` (masteradmin branding
  injection) may need follow-up once you wire the masteradmin flow to the new
  `/api/companies` endpoint — flag anything that looks off when you test.

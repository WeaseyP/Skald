# Private Skald Web App: Build and Deployment Guide

This guide explains how to turn Skald's web interface into an invite-only website where users can sign in, save projects, return later, and request WebAssembly previews without exposing a home computer to the Internet.

It is written for a junior developer who is comfortable with TypeScript and basic command-line work but has not deployed a web application before.

> **Important:** Skald is currently an Electron desktop application. It cannot be deployed as a fully working website by uploading the current `skald-ui` folder. Complete the web-porting milestones in this guide before deploying production.

## 1. What we are building

The finished system has three hosted parts:

```text
User's browser
    |
    | HTTPS
    v
Cloudflare Worker
    |- serves the React application
    |- checks the user's identity and membership
    |- saves projects in D1
    |- saves larger private files in R2
    |
    | authenticated compile request
    v
Disposable Cloud Run compiler container
    |- runs Skald's Odin code generator
    |- compiles a project-specific WASM preview
    |- returns the result
    |- deletes its temporary files
```

There is no connection to the owner's home PC. Do not configure router port forwarding, a home-hosted API, Cloudflare Tunnel to a home computer, or a Tailscale exit path for this deployment.

## 2. Expected cost

For a small private group, the expected hosting cost is $0 per month while usage stays inside the free allowances.

At the time this guide was checked, July 2026:

- Workers Static Assets are free and unlimited. The Workers free plan permits 100,000 Worker requests per day.
- Cloudflare Access has a free plan for up to 50 users.
- D1 includes 5 GB storage, 5 million rows read per day, and 100,000 rows written per day.
- R2 includes 10 GB-month storage, 1 million Class A operations, and 10 million Class B operations per month.
- Cloud Run request-based billing includes 2 million requests, 180,000 vCPU-seconds, and 360,000 GiB-seconds per month.

Free plans and prices change. Re-check the official links in [References](#23-references) before production deployment.

Use the free `workers.dev` address at first. A custom domain is optional and is the only predictable fixed expense.

## 3. Security rules

Follow these rules throughout the work:

1. Never commit API tokens, shared secrets, invite codes, private keys, `.dev.vars`, or service-account files.
2. Never build password storage or session cryptography from scratch.
3. Store only a hash of an invitation code. Show the original code once.
4. Treat an invitation link like a temporary password. Make it single-use and expire it.
5. Validate the Cloudflare Access JWT on every protected request. The presence of a header alone is not proof of identity.
6. Check project ownership on every database read and write. Never trust a project owner ID supplied by the browser.
7. Keep R2 private. Never make the project-assets bucket public.
8. Do not send Cloud Run credentials or compiler secrets to the browser.
9. The compiler must accept validated Skald project JSON, not shell commands or arbitrary compiler arguments.
10. Run each compilation in a new temporary directory with time, memory, input-size, and output-size limits.
11. Do not log project bodies, invite codes, login tokens, or secrets.
12. Set per-user save, upload, and compile quotas before inviting anyone.

Stop and request a security review if a proposed shortcut conflicts with any rule above.

## 4. Current Skald limitations

The current renderer calls Electron through `window.electron`:

- `skald-ui/src/app.tsx` calls `selectOutputPath`.
- `skald-ui/src/hooks/useCodeGeneration.ts` calls `invokeCodegen`.
- `skald-ui/src/hooks/nodeEditor/useFileIO.ts` calls `saveGraph` and `loadGraph`.
- `skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts` calls `buildWasmPreview`.
- `skald-ui/src/preload.ts` exposes those Electron functions.
- `skald-ui/src/main.ts` runs the local code generator and Odin compiler.

The desktop preview process currently does this:

```text
project JSON
  -> skald_codegen.exe
  -> generated_audio.odin + wasm_shim.odin
  -> odin build -target:freestanding_wasm32
  -> skald.wasm
  -> browser AudioWorklet
```

The browser can execute the completed WASM module. It cannot run `skald_codegen.exe` or the local Odin compiler as the application is currently written.

## 5. Work in milestones

Do not attempt the entire conversion in one pull request. Use these milestones:

1. Introduce a platform adapter without changing desktop behaviour.
2. Produce a browser-only React build.
3. Add local browser project save/load.
4. Add the Cloudflare Worker and authenticated user lookup.
5. Add D1 cloud projects and autosave.
6. Add invite-only registration.
7. Add R2 asset storage if it is actually needed.
8. Port the compiler to a Linux container.
9. Connect the Worker to the compiler.
10. Add cost limits, monitoring, backups, and production deployment.

Each milestone must leave the desktop application working.

## 6. Prerequisites

Create these accounts:

- A Cloudflare account.
- A Google Cloud account and billing account for Cloud Run.
- The GitHub account that can work with this repository.

Install these tools on the development machine:

- Git.
- Node.js 22 and npm.
- Docker Desktop for testing the Linux compiler container.
- Google Cloud CLI (`gcloud`).

Confirm the local project works before changing it:

```powershell
git clone https://github.com/WeaseyP/Skald.git
cd Skald
.\scripts\setup-dev.ps1
cd skald-ui
npm run lint
npm run typecheck
npm test
npm start
```

Do not continue until the desktop application starts and the existing checks pass.

## 7. Create a safe working branch

Do not work directly on `main`.

```powershell
git switch main
git pull --ff-only origin main
git switch -c feature/private-web-app
```

Before every commit:

```powershell
git status --short
git diff --check
```

Do not include generated audio, local databases, downloaded toolchains, build output, or secrets in a commit.

## 8. Update ignore rules before creating secrets

Add these entries to the repository `.gitignore` before creating the Cloudflare project:

```gitignore
# Cloudflare local state and secrets
.wrangler/
.dev.vars
.dev.vars.*
!.dev.vars.example

# Web build output
skald-ui/dist-web/

# Local cloud credentials
secrets/
*service-account*.json
```

Create `.dev.vars.example` containing names only, never real values:

```dotenv
ENVIRONMENT=local
CLOUDFLARE_TEAM_DOMAIN=
CLOUDFLARE_ACCESS_AUD=
COMPILER_URL=
COMPILER_SHARED_SECRET=
TURNSTILE_SECRET=
DEV_AUTH_EMAIL=
```

Run this before committing to catch common mistakes:

```powershell
git status --short --ignored
git grep -n -I -E "BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|COMPILER_SHARED_SECRET="
```

If a real secret is ever committed, deleting the line is not enough. Revoke and replace the secret immediately.

## 9. Milestone 1: introduce a platform adapter

The React components should not call `window.electron` directly. Add an interface that represents the operations Skald needs.

Suggested structure:

```text
skald-ui/src/platform/
  types.ts
  desktopPlatform.ts
  webPlatform.ts
  index.ts
```

The interface should cover:

```ts
export interface SkaldPlatform {
  saveProject(document: unknown): Promise<SaveResult>;
  loadProject(): Promise<LoadResult>;
  generateOdin(document: unknown): Promise<GeneratedFile>;
  buildWasmPreview(document: unknown): Promise<ArrayBuffer>;
  selectExportDestination(): Promise<string | null>;
}
```

The exact return types should be explicit TypeScript types rather than `unknown` in the final implementation.

Implementation rules:

- `desktopPlatform.ts` wraps the existing `window.electron` calls.
- `webPlatform.ts` uses browser storage and HTTP APIs.
- Components and hooks import `SkaldPlatform`; they do not inspect `window.electron`.
- Select the implementation in one location, based on whether the Electron preload API exists.
- Keep the existing Electron preload API narrow.

Add tests proving that the existing desktop calls still occur. Add separate tests for the web implementation using mocked `fetch` and IndexedDB.

Milestone acceptance test:

- `npm start` behaves as it did before.
- No component or hook outside `src/platform` directly calls `window.electron`.
- Lint, typecheck, and tests pass.

## 10. Milestone 2: add a web build

The current package has Electron Forge scripts but no standalone web build script.

Create `skald-ui/vite.web.config.ts` that:

- Uses the React Vite plugin.
- Builds the existing renderer entry.
- Outputs to `skald-ui/dist-web`.
- Uses relative or root-safe asset URLs.
- Defines no secrets in client-side environment variables.

Add scripts to `skald-ui/package.json`:

```json
{
  "scripts": {
    "web:dev": "vite --config vite.web.config.ts",
    "web:build": "vite build --config vite.web.config.ts",
    "web:preview": "vite preview --config vite.web.config.ts"
  }
}
```

The snippets in this guide show the intended shape. Merge them into the existing JSON; do not replace the current scripts.

During this milestone, buttons that require a compiler may display a clear message such as `Web preview compilation is not connected yet`. They must not crash.

Run:

```powershell
cd skald-ui
npm run web:build
npm run web:preview
```

Open the preview URL and confirm:

- The graph editor renders.
- A project can be edited.
- Refreshing the page does not produce a blank screen.
- Electron-only buttons fail cleanly.
- Browser developer tools show no uncaught exceptions.

## 11. Milestone 3: local browser projects

Before adding accounts, make the web build safe against network interruption.

Use IndexedDB for a local working copy. Do not use `localStorage` for complete projects or audio files.

Implement:

- A local draft keyed by project ID.
- A debounced save after approximately two seconds without edits.
- A visible state: `Unsaved`, `Saving`, `Saved`, or `Save failed`.
- JSON download for manual backup.
- JSON upload with schema validation.
- Recovery of the latest local draft after a tab or browser crash.

Do not silently overwrite a newer cloud version with an old local draft. The cloud API added later will use a revision number to detect conflicts.

Milestone acceptance test:

1. Create a graph.
2. Wait for `Saved`.
3. Close the tab.
4. Reopen the site.
5. Confirm the graph is restored.
6. Download it as JSON and import it again.

## 12. Milestone 4: create the Cloudflare Worker

Install the Worker dependencies locally in `skald-ui`:

```powershell
npm install --save-dev wrangler
npm install jose zod
```

Suggested structure:

```text
skald-ui/
  worker/
    index.ts
    auth.ts
    routes/
      projects.ts
      invites.ts
      assets.ts
      compile.ts
  migrations/
  wrangler.jsonc
```

Start with this configuration shape:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "skald-web",
  "main": "./worker/index.ts",
  "compatibility_date": "2026-07-22",
  "assets": {
    "directory": "./dist-web",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application",
    "run_worker_first": true
  }
}
```

`run_worker_first` is deliberately `true`. The Worker must check the authenticated user and D1 membership before serving even the static application files.

Add scripts:

```json
{
  "scripts": {
    "worker:dev": "npm run web:build && wrangler dev",
    "worker:deploy": "npm run web:build && wrangler deploy"
  }
}
```

For local development only, the Worker may use `DEV_AUTH_EMAIL` from `.dev.vars`. It must accept this bypass only when `ENVIRONMENT` is exactly `local`. Make the Worker fail closed if a development identity is configured in any other environment.

## 13. Milestone 5: create the D1 database

Log in to Cloudflare:

```powershell
npx wrangler login
```

Create the production database with an Oceania location hint:

```powershell
npx wrangler d1 create skald-web-production --location oc
```

Wrangler prints a database ID and can update `wrangler.jsonc`. Use the binding name `DB`.

Create the first migration:

```powershell
npx wrangler d1 migrations create skald-web-production initial_schema
```

Put the following schema into the generated migration file. Review it before applying it:

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    access_subject TEXT UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
    status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    last_login_at INTEGER
);

CREATE TABLE invites (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL REFERENCES users(id),
    expires_at INTEGER NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
    use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
    revoked_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    document_json TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    deleted_at INTEGER
);

CREATE INDEX projects_by_owner_updated
    ON projects(owner_id, updated_at DESC);

CREATE TABLE project_versions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    owner_id TEXT NOT NULL REFERENCES users(id),
    revision INTEGER NOT NULL,
    document_json TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(project_id, revision)
);

CREATE INDEX versions_by_project
    ON project_versions(project_id, revision DESC);

CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id),
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    object_key TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE daily_compile_usage (
    owner_id TEXT NOT NULL REFERENCES users(id),
    usage_date TEXT NOT NULL,
    compile_count INTEGER NOT NULL DEFAULT 0,
    cpu_ms INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(owner_id, usage_date)
);
```

Apply it locally first:

```powershell
npx wrangler d1 migrations apply skald-web-production --local
```

Run the application locally and test it. Only then apply it remotely:

```powershell
npx wrangler d1 migrations apply skald-web-production --remote
```

Never edit a migration that has already been applied to production. Create a new migration instead.

## 14. Project API and autosave

Implement these authenticated endpoints:

```text
GET    /api/me
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PUT    /api/projects/:id
DELETE /api/projects/:id
```

Rules for every project endpoint:

- Derive the owner from the verified Access JWT and D1 user record.
- Never accept `owner_id` from the request body.
- Include `owner_id = ?` in every project query.
- Validate request JSON using a strict schema.
- Reject unreasonably large project documents. Start with a 512 KiB JSON limit.
- Use parameterized D1 queries, never string-built SQL.
- Use soft deletion first by setting `deleted_at`.
- Keep only a sensible number of versions, such as the latest 20 per project.

For updates, the browser sends the revision it last read. Update only when that revision still matches:

```sql
UPDATE projects
SET document_json = ?, revision = revision + 1, updated_at = unixepoch()
WHERE id = ? AND owner_id = ? AND revision = ? AND deleted_at IS NULL;
```

If zero rows change, return HTTP `409 Conflict`. The UI must offer to reload the server version or save the local draft as a copy.

Do not return another user's project as `403`; return `404` so the API does not confirm that the project exists.

## 15. Milestone 6: invite-only registration and login

Use two Workers:

- `skald-join`: public, contains only the invite redemption form and endpoint.
- `skald-web`: private application, serves Skald and its authenticated API.

Both Workers may bind to the same D1 database. Only `skald-web` can create invites or administer users.

### 15.1 Create invitation codes

Add an admin-only endpoint:

```text
POST /api/admin/invites
```

When called:

1. Confirm the authenticated D1 user has role `admin`.
2. Generate at least 32 random bytes using `crypto.getRandomValues`.
3. Encode the bytes with base64url.
4. Hash the code with SHA-256.
5. Store only the hash, expiry, and maximum use count.
6. Return the original invitation URL once.

Example result:

```text
https://skald-join.<account>.workers.dev/join?code=<one-time-secret>
```

Do not put the original code in logs, analytics, error reports, or the database.

Default invitations should:

- Expire after 24 hours.
- Work once.
- Be revocable before use.
- Create a normal `user` role, never `admin`.

### 15.2 Redeem an invitation

The public join page asks for:

- Invitation code.
- Email address.
- A successful Turnstile challenge.

The redemption endpoint must:

1. Rate-limit by IP and invitation hash.
2. Validate Turnstile on the server.
3. Normalize the email by trimming it and converting it to lowercase.
4. Hash the submitted invitation code.
5. Atomically confirm it is valid, not revoked, not expired, and below its use limit.
6. Create the D1 user record.
7. Consume the invitation.
8. Redirect to the private Skald application.

If two requests redeem the same one-use code concurrently, only one may succeed. Use a D1 transaction or batch plus a conditional update, and add a concurrency test.

Do not reveal whether a particular email is already registered. Use a generic response.

### 15.3 Configure Cloudflare Access

In the Cloudflare dashboard:

1. Open **Zero Trust**.
2. Open **Settings > Authentication**.
3. Add **One-time PIN** as an identity provider.
4. Open **Workers & Pages > skald-web > Settings > Domains & Routes**.
5. Enable Cloudflare Access for the `workers.dev` route.
6. Create an Access Allow policy using the One-time PIN login method.
7. Set a reasonable session duration, such as 24 hours.

This broad Access policy proves that the visitor owns an email address, but it does **not** by itself prove that the email was invited. Cloudflare warns that allowing the One-time PIN login method permits any valid email to authenticate.

The `skald-web` Worker must therefore perform a second authorization check:

1. Read `Cf-Access-Jwt-Assertion`.
2. Validate its signature against the Cloudflare Access JWKS using `jose`.
3. Validate issuer and the exact application audience tag.
4. Extract the verified email and subject.
5. Find an active D1 user with that email.
6. Reject the request with `403` if no active invited user exists.
7. Only then serve assets or an API response.

Store these as Worker configuration or secrets:

```text
CLOUDFLARE_TEAM_DOMAIN
CLOUDFLARE_ACCESS_AUD
```

The audience tag is not a password, but it should still be managed as deployment configuration. Follow Cloudflare's current JWT validation example rather than writing a JWT parser.

### 15.4 First administrator

The first administrator cannot be created through an invite because no administrator exists yet.

Create the initial row manually using Wrangler after Access has verified the owner's email:

```powershell
npx wrangler d1 execute skald-web-production --remote --command "INSERT INTO users (id, email, role, status) VALUES ('<UUID>', '<OWNER_EMAIL>', 'admin', 'active');"
```

Replace both placeholders. Do not paste a real email into documentation or commit history.

### 15.5 Revocation

The admin user-management page needs actions to:

- Disable a user.
- Re-enable a user.
- Revoke unused invitations.
- Delete or transfer projects only after explicit confirmation.

Disabling a user must immediately block API and asset access even if their Cloudflare session cookie has not expired. This is why the D1 status check occurs on every request.

## 16. Milestone 7: private file storage with R2

Skip this milestone if Skald projects contain only JSON. Add R2 when users need to upload samples, rendered audio, or other larger files.

Create a private bucket:

```powershell
npx wrangler r2 bucket create skald-private-assets
```

Add an R2 binding named `ASSETS_BUCKET` to `wrangler.jsonc`. Do not enable public access for the bucket.

Use object keys that do not contain user-supplied paths:

```text
users/<internal-user-id>/projects/<project-id>/<asset-uuid>
```

Store the original display name in D1, not in the R2 key.

Initial quotas:

- 20 MiB maximum per uploaded file.
- 100 MiB total per user.
- 5 GiB total application storage ceiling.
- Explicit allowlist of accepted audio MIME types and file signatures.

All upload and download requests must check the D1 asset row belongs to the authenticated user. Never accept an arbitrary R2 object key from the browser.

Generated WASM can normally be treated as a cache and regenerated. User projects and uploaded samples are durable data and need backups.

## 17. Milestone 8: port the compiler to Linux

Cloud Run uses Linux containers. The current repository builds `skald_codegen.exe` with a Windows batch file, so the existing executable cannot be copied into Cloud Run.

Create a separate compiler service, for example:

```text
services/compiler/
  Dockerfile
  package.json or other server manifest
  src/
  scripts/
```

The container build must:

1. Download the exact pinned Odin version used by Skald.
2. Verify the download checksum.
3. Build the Skald code generator as a Linux executable.
4. Copy only the generator, Odin files needed at runtime, and the small HTTP service into the final image.
5. Run as a non-root user.
6. Expose one health endpoint and one compile endpoint.

Do not silently switch Odin versions. Update the desktop and hosted compiler together and test their outputs against the same fixtures.

For every compile request:

1. Reject a body over the configured limit before parsing it.
2. Validate the complete project schema.
3. Create a unique directory beneath the container's temporary directory.
4. Invoke the generator with an argument array, not a shell-built command string.
5. Generate `generated_audio.odin` and `wasm_shim.odin` inside that directory.
6. Invoke Odin with:

```text
odin build <temporary-directory>
  -target:freestanding_wasm32
  -no-entry-point
  -o:speed
  -out:<temporary-directory>/skald.wasm
```

7. Enforce a short timeout, initially 30 seconds.
8. Reject unexpectedly large output, initially over 5 MiB.
9. Return `application/wasm` for preview builds.
10. Delete the temporary directory in a `finally` block.

Never reuse the fixed desktop preview directory on the server. Every request needs its own directory, even if Cloud Run concurrency is initially one.

Run the existing acceptance and golden tests in the Linux container. Add a smoke test that submits a small valid graph and instantiates the returned WASM module.

## 18. Milestone 9: deploy the compiler to Cloud Run

Use the Sydney region unless testing shows another region is materially better:

```text
australia-southeast1
```

Create a Google Cloud project dedicated to Skald. Do not place unrelated services in it.

Set the active project:

```powershell
gcloud auth login
gcloud config set project <PROJECT_ID>
```

Enable the required services:

```powershell
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
```

Create an Artifact Registry repository:

```powershell
gcloud artifacts repositories create skald --repository-format=docker --location=australia-southeast1
```

Build the container from the repository root:

```powershell
gcloud builds submit --tag australia-southeast1-docker.pkg.dev/<PROJECT_ID>/skald/compiler:v0.1.0 services/compiler
```

Deploy conservatively:

```powershell
gcloud run deploy skald-compiler `
  --image australia-southeast1-docker.pkg.dev/<PROJECT_ID>/skald/compiler:v0.1.0 `
  --region australia-southeast1 `
  --allow-unauthenticated `
  --min 0 `
  --max 1 `
  --concurrency 1 `
  --cpu 1 `
  --memory 1Gi `
  --timeout 30s
```

`--allow-unauthenticated` means the HTTPS endpoint is reachable, not that it may compile for anonymous callers. The compiler service must reject every request that does not have a valid signed request from the Cloudflare Worker before spawning any process.

A stronger future setup can use Google IAM service-to-service authentication. Do not attempt to invent that flow during the first implementation; use Google's documented identity-token flow and obtain a security review when upgrading.

### Signed Worker-to-compiler requests

Create a random 32-byte or longer shared secret. Store it as:

- A Cloudflare Worker secret named `COMPILER_SHARED_SECRET`.
- A Google Secret Manager secret exposed to the compiler service.

Never store it in `wrangler.jsonc`, source code, a Docker image, GitHub logs, or browser JavaScript.

The Worker sends:

```text
X-Skald-Timestamp: <unix timestamp>
X-Skald-Signature: <HMAC-SHA256 of timestamp + newline + raw request body>
```

The compiler must:

1. Reject missing headers.
2. Reject timestamps more than five minutes old.
3. Recompute the HMAC from the raw body.
4. Compare signatures using a timing-safe comparison.
5. Reject replays where practical.
6. Perform all checks before JSON parsing or process creation.

The browser calls `/api/compile` on the Cloudflare Worker. The browser never calls Cloud Run directly.

## 19. Compile quotas and cost controls

Start with conservative limits:

- 100 compile requests per user per day.
- One compilation at a time per user.
- One Cloud Run instance.
- One request per container at a time.
- 30-second timeout.
- 512 KiB input limit.
- 5 MiB output limit.

Increment `daily_compile_usage` atomically before calling Cloud Run. Do not increment only after success, because attackers could intentionally submit failing builds.

In Google Cloud:

1. Create a small monthly budget and alerts at 50%, 80%, and 100%.
2. Remember that a budget alert is not a hard cap.
3. Keep Cloud Run minimum instances at zero.
4. Keep maximum instances at one initially.
5. Review Cloud Run requests, CPU time, memory time, and Artifact Registry storage monthly.

Add an application-level monthly kill switch. When the configured compile allowance is reached, `/api/compile` returns `429 Too Many Requests` and explains that compilation is temporarily unavailable. Editing and saving must continue to work.

## 20. Testing checklist

### Authentication and invitation tests

- An unregistered email cannot receive application data.
- Missing, expired, revoked, reused, and malformed invitations fail.
- A one-use invitation succeeds exactly once under concurrent requests.
- A normal user cannot create invitations.
- A disabled user is rejected even with a valid Access session.
- A JWT for the wrong audience is rejected.
- A forged or expired JWT is rejected.

### Project isolation tests

- User A cannot list User B's projects.
- User A cannot read, update, delete, version, compile, or download assets belonging to User B.
- Changing an ID in the browser request does not bypass ownership checks.
- A stale revision produces `409 Conflict` rather than overwriting newer work.
- Invalid and oversized project JSON is rejected.

### Browser tests

- The site works in current desktop Chrome, Edge, and Firefox.
- The main editing flow works on a phone-sized screen.
- Audio begins only after a user gesture.
- Losing the network does not destroy the local draft.
- Signing out prevents further API access.
- Save state is clearly visible.

### Compiler tests

- Valid fixtures compile on Linux.
- Invalid projects do not spawn arbitrary commands.
- Timeouts terminate the generator/compiler process.
- Temporary directories are removed after success and failure.
- Overlapping requests never share files.
- Returned WASM instantiates in the browser.
- The desktop and hosted compilers produce compatible interfaces.

### Existing repository checks

```powershell
cd skald-ui
npm run lint
npm run typecheck
npm test
npm run web:build

cd ..\skald-backend
.\run_acceptance.bat
.\run_golden.bat check
```

## 21. Deployment procedure

Use a staging deployment before production.

1. Merge the feature branch into a temporary `dev` branch through a pull request.
2. Use separate staging D1 and R2 resources. Never test destructive migrations against production.
3. Deploy the Worker and compiler to staging.
4. Test invitation, login, autosave, reopening projects, conflict handling, compile limits, and account revocation.
5. Review logs for project data or secrets and remove any unsafe logging.
6. Run the complete checklist above.
7. Open a `dev` to `main` pull request.
8. Require green CI and review before merging.
9. Apply production database migrations before deploying code that requires them.
10. Deploy the production compiler image using an immutable version tag.
11. Deploy the production Worker.
12. Perform a smoke test using the owner's account.
13. Delete the temporary `dev` branch after the production merge if that remains the repository workflow.

Recommended production command order:

```powershell
cd skald-ui
npm ci
npm run lint
npm run typecheck
npm test
npm run web:build
npx wrangler d1 migrations apply skald-web-production --remote
npm run worker:deploy
```

Do not automatically apply production migrations from an unreviewed pull request.

## 22. Operations and recovery

### Weekly

- Check failed logins and invitation attempts.
- Check compile failures and quota rejections.
- Confirm no secret or project body appears in logs.

### Monthly

- Review Cloudflare Workers, D1, and R2 usage.
- Review Google Cloud Run, Cloud Build, and Artifact Registry usage.
- Delete abandoned compiler images while retaining the current and previous working versions.
- Test restoring a project backup.
- Review active users and disable accounts that no longer need access.

### Before each release

- Export the production D1 database using Wrangler.
- Confirm the export is stored somewhere private and recoverable.
- Record the Worker version, compiler image tag, migration level, and Odin version.
- Confirm the previous Worker and compiler versions can be redeployed.

If a deployment fails:

1. Stop inviting users.
2. Disable compilation if the compiler is involved.
3. Redeploy the previous Worker and compiler image.
4. Do not reverse a database migration by guessing. Create and test a corrective migration or restore a verified backup.
5. Write down what happened before making additional changes.

## 23. References

Official documentation checked while preparing this guide:

- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)
- [Workers Static Assets billing and limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Workers configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Protecting a Worker with Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/choose-application-type/)
- [Cloudflare Access one-time PIN login](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)
- [Cloudflare Access policy warnings](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
- [Validating Cloudflare Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Cloudflare D1 getting started](https://developers.cloudflare.com/d1/get-started/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare Turnstile plans](https://developers.cloudflare.com/turnstile/plans/)
- [Google Cloud Run pricing](https://cloud.google.com/run/pricing)
- [Cloud Run request-based billing](https://docs.cloud.google.com/run/docs/configuring/billing-settings)
- [Cloud Run maximum instances](https://docs.cloud.google.com/run/docs/configuring/max-instances)
- [Google Cloud budget warning](https://docs.cloud.google.com/billing/docs/how-to/budgets)

## 24. Definition of done

The private web application is ready only when all of the following are true:

- The Electron desktop build still works.
- The standalone web build has no direct `window.electron` dependency.
- Only invited, active users can receive the application or API data.
- Users can create, rename, autosave, reopen, export, and delete their own projects.
- Project ownership tests cover every endpoint.
- Local drafts survive a lost connection or closed tab.
- Invitation codes are hashed, expiring, single-use, rate-limited, and revocable.
- The Access JWT signature, issuer, and audience are validated.
- Uploaded files are private and quota-limited.
- The compiler runs in a disposable hosted Linux container, not a home computer.
- The browser never receives compiler credentials.
- Compile requests are authenticated, validated, rate-limited, isolated, and timed out.
- Billing alerts, application quotas, backups, rollback instructions, and monitoring are configured.
- Staging tests and existing Skald tests pass.
- A new developer can deploy staging by following this document without relying on undocumented knowledge.

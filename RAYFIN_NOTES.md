# Rayfin / Fabric Apps: verified reference (June 2026)

Distilled from the official Microsoft Learn Fabric Apps docs and the `@microsoft/rayfin-core` /
`@microsoft/rayfin-cli` API references (CLI v1.33.1, Beta). Fabric Apps is in PREVIEW and the CLI is
iterating fast (18 versions in its first days), so pin a version and confirm syntax before a real build.

This is the technical companion to the POC `README.md`.

## 1. Data model decorators (`@microsoft/rayfin-core`)

| Decorator | Purpose | SQL type (mssql) |
| --- | --- | --- |
| `@entity()` | Marks a class as a table | (table) |
| `@uuid()` | Field named `id` becomes the PK (auto-added if omitted) | UNIQUEIDENTIFIER |
| `@text({min,max,regex,unique,optional,default})` | String | NVARCHAR (MAX if no `max`) |
| `@int({min,max})` | Whole number | INT |
| `@decimal({precision,scale})` | Money, default (18,2), max precision 28 | DECIMAL(p,s) |
| `@boolean({default})` | True/false | BIT |
| `@date({optional})` | Date/time | DATETIME2 |
| `@email({unique})` | Validated email string | NVARCHAR |
| `@set('a','b')` | Enum, adds a CHECK constraint | NVARCHAR + CHECK |
| `@one(() => T)` | Many-to-one, generates a `<prop>_id` FK | (FK column) |
| `@many(() => T)` | One-to-many reverse side | (navigation) |
| `@role(...)` / `@authenticated(...)` | Row-level + field-level security | (policy) |
| `@blob()` | Storage folder | (OneLake storage) |

Traps that cost time:
- The TypeScript `?` marker alone does NOT make a column nullable. You must pass `{ optional: true }`.
- These are standard TC39 decorators, not legacy TypeScript decorators.
- Many-to-many is not supported. Use an explicit join entity with two `@one()` navigations.
- You cannot relate to the built-in user. Add a plain `@text() user_id` populated from `claims.sub`.
- **Relationship imports must be value imports, not `import type`.** `@one(() => Rep)` references the
  class at runtime, so `import type { Rep }` erases it and fails to compile. Use `import { Rep }`. The
  lazy `() => Rep` arrow keeps the resulting circular imports safe. (This bit us in this repo.)
- Every entity must be registered in `rayfin/data/schema.ts`.

## 2. CLI reference (`@microsoft/rayfin-cli`)

| Command | What it does |
| --- | --- |
| `npm create @microsoft/rayfin@latest <name> --template <t> --workspace-id <id>` | Scaffold a project |
| `rayfin up` | All-in-one deploy: creates the App item, syncs settings, applies schema, builds and uploads the frontend |
| `rayfin up db apply [--force]` | Schema only. Blocks destructive changes unless `--force` (data-loss risk) |
| `rayfin up staticapp deploy` | Frontend only |
| `rayfin up status / list / switch` | Manage deployments (dev vs prod workspaces) |
| `rayfin env --framework vite` | Generate `.env.local` for the frontend |
| `rayfin login / logout` | Microsoft Entra sign-in |

- Templates: `blank`, `todoapp`, `dataapp` (analytics), `react-vite`, plus external Git templates
  (the `microsoft/awesome-rayfin` gallery).
- `rayfin up` creates three child items under the App: **SQL database in Fabric**, **Authentication**,
  **Static Content**. Backend URL: `https://<app>-app.rayfin.windows.net/` with `/api/graphql`, `/auth`, `/storage`.
- Node must be 20, 22, or 24 (odd majors 21/23 are excluded). Docker is required for the local full stack.
- `rayfin dev`, `ai-files install`, and `--exclude-services` are NOT in the official CLI reference.
  Local dev is meant to be `npm run dev` against the Docker stack. Our template's `dev` script uses
  `--exclude-services`, which may be from an older CLI build, so do not rely on it staying valid.

## 3. Data API (RayfinClient)

Type-safe, no raw GraphQL needed:

```typescript
const leads = await client.data.Lead
  .select(['id','customerName','estimatedValue','rep.name'])   // dotted nav via @one/@many
  .where({ stage: { eq: 'quote' } })
  .orderBy({ createdAt: 'desc' })
  .first(25).executePaginated();
```

- Filter operators: `eq, ne, gt, gte, lt, lte, contains`.
- Methods: `.select().execute()`, `.findByPk(id)`, `.create()`, `.update(filter, fields)`,
  `.delete(filter)`, cursor pagination via `.first(n).after(cursor).executePaginated()`.
- No `.count()` (use `items.length`). `totalCount` on `PagedResult` is not populated.
- The client auto-attaches the auth session to every call. Never pass tokens manually.

## 4. Authentication and access control

- Deployed auth is **Fabric SSO (Entra) exclusively**, via `ensureSignedInWithFabric` (postMessage
  handoff, PKCE S256, 5-minute flow timeout). Email/password works in **local dev only**.
- Row-level and field-level security via `@role`:

```typescript
@role('authenticated', ['read','update'], {
  policy: (claims, item) => claims.role.eq('admin').or(claims.sub.eq(item.rep_id)),  // owner or admin
})
@role('authenticated', 'read', { exclude: ['adminNotes'] })                          // field-level hide
```

- Policy operators: `.eq()`, `.and()`, `.or()`. Claims: `claims.sub`, `claims.email`, `claims.role`.
- Static content is served from a public URL, so keep no secrets in the frontend bundle.

## 5. Data (analytics) app template

- Created with `--template dataapp`, then driven by GitHub Copilot. You hand it a semantic-model share
  link and it scaffolds the dashboard.
- It connects to an **existing** semantic model through the **Execute DAX Queries REST API** (Arrow
  IPC format, **Premium / Fabric capacity only**). It does NOT auto-build a Direct Lake model over the
  app's own database. That is why the star-schema plus Direct Lake build in this repo is the required
  bridge, and "connectivity to additional Fabric data sources" is on the roadmap.
- Extra prerequisites beyond a normal app: the **Dataset Execute Queries REST API** tenant setting
  (Integration settings), plus **Build and Read** on the target model, and the model on a capacity.
- Viz-as-code: each visual is three files, `<name>.dax` (with `{{FILTERS}}` cross-filter placeholders),
  `<name>.json` (Vega-Lite spec), and `<name>.ts` (factory that binds them). One `global.css` themes
  everything, format strings are defined once per column, and a Playwright pass validates rendering.
- Known limitation: a semantic-model data app cannot be opened outside the Fabric portal yet. The Open
  button errors the queries. Temporary, per docs.

## 6. The translytical loop (confirmed mechanism)

A SQL database in Fabric (which a Rayfin app provisions) **auto-mirrors into OneLake as Delta parquet,
always on, with no configuration and no ETL**. It also auto-provisions a read-only SQL analytics
endpoint, and a Power BI semantic model can sit on the mirror in Direct Lake mode for near-real-time
analytics. Write-back to close the loop is via translytical task flows plus Fabric user data functions.

```
Rayfin app (write) -> SQL database in Fabric -> auto-mirror -> OneLake Delta
                                                                   |
                                  read-only SQL analytics endpoint + Direct Lake semantic model
                                                                   |
                                          Power BI report   /   data app (Execute DAX)
```

The only step the platform does not hand you is the modeling: shaping the mirrored operational tables
into a star schema and a Direct Lake model. That is this repo's data-engineering layer.

## 7. Constraints worth pinning

- Region-gated. Both the operational app and the data app are Fabric Apps items, so both are blocked in
  regions carrying footnote 8 on the region-availability page (East US is one of them).
- Beta CLI, fast-moving. Pin the version.
- No many-to-many, no `.count()`, no composite keys.
- Destructive schema changes need `--force` and can lose data.

## Sources
- Overview: https://learn.microsoft.com/fabric/apps/overview
- Data models: https://learn.microsoft.com/fabric/apps/data-models
- CLI reference: https://learn.microsoft.com/fabric/apps/cli-reference
- Read and write data (GraphQL): https://learn.microsoft.com/fabric/apps/read-write-data-graphql
- Data permissions (@role): https://learn.microsoft.com/fabric/apps/data-permissions
- Fabric authentication: https://learn.microsoft.com/fabric/apps/fabric-authentication
- Data app template: https://learn.microsoft.com/fabric/apps/data-apps-template
- SQL database mirroring (auto-mirror confirmation): https://learn.microsoft.com/fabric/database/sql/mirroring-overview
- Translytical use case: https://learn.microsoft.com/fabric/database/sql/use-case-translytical-applications
- Region availability: https://learn.microsoft.com/fabric/admin/region-availability

# CLAUDE.md — AI Assistant Guide for GTFS Generator

This document describes the codebase structure, conventions, and workflows for AI assistants working on this project.

---

## Project Overview

**GTFS Generator** is a full-stack web application for public transit network planning. It allows transport planners to:
- Draw bus networks interactively on a map
- Generate and manage GTFS (General Transit Feed Specification) data
- Import/export GTFS feeds
- Define trips, schedules, and agencies
- Use OSRM (Open Source Routing Machine) for road-network-accurate segment routing

**Stack:** React 19 + Vite (frontend) · Fastify 5 + TypeScript (backend) · SQLite (database) · Keycloak (auth) · MapLibre GL (maps) · OSRM in Docker (routing)

---

## Repository Structure

```
gtfs_generator/
├── server/                   # Backend — Fastify + TypeScript + SQLite
│   ├── src/
│   │   ├── server.ts         # Main entry point: registers routes & middleware
│   │   ├── db/
│   │   │   ├── index.ts      # DB init, connection, migrations
│   │   │   └── schema.sql    # SQLite schema (all tables)
│   │   ├── routes/           # HTTP handlers (one file per domain)
│   │   │   ├── agency.ts
│   │   │   ├── calendar.ts
│   │   │   ├── export.ts     # GTFS ZIP export
│   │   │   ├── import.ts     # GTFS ZIP scan + selective import
│   │   │   ├── maps.ts       # OSRM map instance management
│   │   │   ├── projects.ts   # Project CRUD + multi-tenancy
│   │   │   ├── routes.ts     # Transit route CRUD + sequences
│   │   │   ├── segments.ts   # Segment creation with auto-routing
│   │   │   ├── stops.ts
│   │   │   ├── trips.ts      # Trips + stop_times
│   │   │   └── admin.ts      # Users, backups, settings, Keycloak admin
│   │   ├── middleware/
│   │   │   └── auth.ts       # JWT verification, project-access guard
│   │   ├── services/
│   │   │   ├── OsrmService.ts              # OSRM container lifecycle
│   │   │   ├── routing.ts                  # OSRM HTTP API calls
│   │   │   ├── ProjectRoutingService.ts    # Resolves project → OSRM URL
│   │   │   ├── MapRepository.ts            # In-memory map instance state
│   │   │   ├── structuredImportService.ts  # Complex GTFS import logic
│   │   │   └── osrm/                       # Docker orchestration sub-modules
│   │   │       ├── DockerManager.ts
│   │   │       ├── OsrmProcessor.ts
│   │   │       ├── config.ts
│   │   │       ├── security.ts
│   │   │       └── state.ts
│   │   └── constants/
│   │       └── routingProfiles.ts          # bus_mixed, bus_trunk, bus_mixed_exclusive
│   ├── scripts/
│   │   └── osrm_manager.ts   # CLI: OSRM Docker setup script
│   ├── package.json
│   ├── tsconfig.json
│   └── tsconfig.build.json
│
├── client/                   # Frontend — React 19 + Vite + TailwindCSS v4
│   ├── src/
│   │   ├── main.tsx          # Entry: wraps app in context providers
│   │   ├── App.tsx           # Root routing component
│   │   ├── config.ts         # API base URL config
│   │   ├── types.ts          # Shared TypeScript interfaces
│   │   ├── components/       # 40+ React components
│   │   │   ├── MapEditor.tsx        # Core map editing interface
│   │   │   ├── MapManager.tsx       # OSRM map instance management UI
│   │   │   ├── Layout/              # MainLayout, Sidebar
│   │   │   ├── UI/                  # Reusable: DataTable, MapControls, Draggable
│   │   │   ├── AgencyManager.tsx
│   │   │   ├── CalendarManager.tsx
│   │   │   ├── TripsManager.tsx
│   │   │   ├── RouteCatalog.tsx
│   │   │   ├── StopsCatalog.tsx
│   │   │   ├── SegmentsCatalog.tsx
│   │   │   ├── ImportModal.tsx
│   │   │   ├── ExportModal.tsx
│   │   │   ├── AdminPanel.tsx
│   │   │   └── SimulationPanel.tsx
│   │   ├── context/          # Global state via React Context
│   │   │   ├── AuthContext.tsx    # Keycloak auth + project selection
│   │   │   ├── EditorContext.tsx  # Map editor state
│   │   │   ├── ThemeContext.tsx   # Dark/light mode
│   │   │   └── SettingsContext.tsx
│   │   └── utils/
│   ├── vite.config.ts
│   ├── eslint.config.js
│   └── package.json
│
├── import/                   # Keycloak realm config & import templates
├── GTFS_ejemplo/             # Sample GTFS feed for testing
├── skills/                   # Anthropic AI skill modules (reference only)
├── docker-compose.yml        # App + Keycloak + PostgreSQL
├── Dockerfile                # Multi-stage production build
├── .env.example              # Environment variable template
├── package.json              # Root npm workspace
├── README.md                 # Project overview (Spanish)
├── USER_GUIDE.md
├── AGENTS.md
└── INSTALL_*.md              # Platform-specific setup guides
```

---

## Development Workflows

### Prerequisites

- Node.js 20+
- Docker (for OSRM and Keycloak)
- npm 10+

### Install

```bash
npm run install:all   # installs both /server and /client dependencies
```

### Run in Development

```bash
npm start
# client (Vite dev server):  http://localhost:5173
# server (tsx watch):        http://localhost:3001
```

The Vite dev server proxies `/api/*` to `localhost:3001`.

### Build for Production

```bash
npm run build          # compiles /client (Vite) → /client/dist
                       # compiles /server (tsc) → /server/dist, copies schema.sql
npm run start:prod     # starts /server/dist (also serves frontend)
```

### Docker Deployment

```bash
docker compose up --build
# App:      http://localhost:3001
# Keycloak: http://localhost:8080
```

### OSRM Setup (road routing)

```bash
npm run osrm:setup -- <city_name> <port> "<geofabrik_pbf_url>"
# Example:
npm run osrm:setup -- bogota 5001 "https://download.geofabrik.de/south-america/colombia-latest.osm.pbf"
```

---

## Key Conventions

### TypeScript

- **Strict mode** is enabled in both server and client tsconfigs.
- Prefer explicit types over `any`. Use `unknown` when input type is truly unknown.
- Use `interface` for object shapes; use `type` for unions and aliases.
- All async functions must use `async/await`, not raw Promise chains.

### Backend (Fastify)

- Every route file exports a Fastify plugin function registered in `server.ts`.
- All `/api/*` requests require a valid JWT (`Authorization: Bearer <token>`) verified by `auth.ts`.
- Project scope is enforced via the `X-Project-Id` header — all DB queries must filter by `project_id`.
- Use parameterized queries with `better-sqlite3` prepared statements; **never** interpolate values into SQL strings.
- Error responses follow the pattern: `reply.code(4xx).send({ error: 'message' })`.
- File upload size limit is 1 GB (multipart plugin).

### Frontend (React)

- Functional components only — no class components.
- State is managed with React Context (`AuthContext`, `EditorContext`, etc.) + local `useState`.
- All API calls go through the `fetch` interceptor in `AuthContext` which injects the JWT and `X-Project-Id` header automatically.
- Use TailwindCSS utility classes for styling. TailwindCSS v4 is used with the Vite plugin (no `tailwind.config.js`).
- Import icons exclusively from `lucide-react`.

### Database

- The SQLite database at `/server/gtfs.db` (dev) or `/data/gtfs.db` (Docker) is the single source of truth.
- Every GTFS table includes a `project_id` column for multi-tenant isolation.
- Schema migrations: add new columns/tables to `schema.sql` and handle them in `db/index.ts`.
- Foreign keys: SQLite FK enforcement is enabled (`PRAGMA foreign_keys = ON`).

### Naming

| Context | Convention |
|---------|-----------|
| Files/folders | `camelCase.ts`, `PascalCase.tsx` for components |
| TypeScript functions | `camelCase` |
| TypeScript classes/interfaces | `PascalCase` |
| Database columns | `snake_case` |
| React components | `PascalCase` |
| CSS classes | Tailwind utility classes only |
| Environment variables | `UPPER_SNAKE_CASE` |

---

## Data Model

All GTFS tables mirror the [GTFS Static specification](https://gtfs.org/schedule/reference/) with an added `project_id` column.

### Key Tables

| Table | Purpose |
|-------|---------|
| `projects` | Named city/project workspaces |
| `map_instances` | OSRM container metadata per project |
| `agency` | Transit agency info |
| `stops` | Stops and stations (has custom `node_type`) |
| `routes` | Transit routes |
| `calendar` | Service day patterns |
| `trips` | Individual scheduled trips |
| `stop_times` | Per-stop arrival/departure times |
| `shapes` | Polyline geometry for routes |
| `segments` | Road segments between stops (custom, with routing_profile) |
| `segment_time_slots` | Time-dependent travel times per segment |
| `route_parkings` | Parking assignments for routes |
| `users` | Keycloak user cache |
| `user_projects` | User↔project role assignments |
| `settings` | Key-value app configuration |

### Segment Types

- `revenue` — passenger-carrying (between consecutive stops)
- `empty` — deadhead movement (positioning between trips)

### Routing Profiles

Three OSRM profiles defined in `server/src/constants/routingProfiles.ts`:
- `bus_mixed` — buses using mixed traffic lanes
- `bus_trunk` — buses using dedicated trunk lanes
- `bus_mixed_exclusive` — buses on exclusive mixed-traffic lanes

---

## API Overview

All routes are prefixed `/api/` and require JWT + `X-Project-Id`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stops` | List stops for current project |
| POST | `/api/stops` | Create stop |
| PUT | `/api/stops/:id` | Update stop |
| DELETE | `/api/stops/:id` | Delete stop |
| GET | `/api/segments` | List segments (`?type=revenue\|empty`) |
| POST | `/api/segments` | Create segment (auto-routes via OSRM) |
| GET | `/api/routes` | List transit routes |
| POST | `/api/routes` | Create route |
| GET | `/api/routes/:id/trips` | Get trips for a route |
| POST | `/api/routes/:id/trips` | Create trip |
| POST | `/api/routes/:id/trips/:tid/auto` | Auto-generate stop_times |
| POST | `/api/gtfs/scan` | Upload & scan a GTFS ZIP |
| POST | `/api/gtfs/execute` | Execute filtered GTFS import |
| GET | `/api/gtfs/export` | Download GTFS ZIP |
| GET | `/api/projects/my` | List user's projects |
| POST | `/api/projects` | Create project |
| GET | `/api/admin/settings` | Read app settings |
| POST | `/api/admin/backup` | Create DB backup |
| GET | `/api/admin/osrm-status` | OSRM health |
| * | `/api/admin/users/*` | User management (admin only) |

---

## Authentication & Authorization

- **Identity Provider:** Keycloak 26 (OIDC/OAuth2)
- **JWT Verification:** RSA-256 using Keycloak's JWKS endpoint
- **Super Admin:** Users with `realm_access.roles` containing `"admin"`
- **Project Access:** Enforced via `user_projects` table; roles are `owner` or `viewer`
- **Frontend Auth:** Managed by `AuthContext.tsx` using `keycloak-js`; all `fetch` calls auto-attach the token and active project ID

---

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Description |
|----------|-------------|
| `KEYCLOAK_URL` | Keycloak base URL (e.g. `http://localhost:8080`) |
| `KEYCLOAK_REALM` | Realm name |
| `KEYCLOAK_CLIENT_ID` | Backend client ID |
| `KEYCLOAK_CLIENT_SECRET` | Backend client secret |
| `DB_PATH` | SQLite database file path |
| `OSRM_BASE_URL` | Default OSRM URL (if not using per-project containers) |
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) |
| `PORT` | Server port (default `3001`) |

---

## Testing

There is currently **no automated test suite**. The `server` package has a placeholder test script.

When adding tests:
- Use **Vitest** for both server unit tests and client component tests (consistent with the Vite ecosystem)
- Place server tests under `server/src/__tests__/`
- Place client tests under `client/src/__tests__/`
- For E2E tests, use **Playwright** (already referenced in `/skills/webapp-testing/`)

---

## Linting

```bash
npm --prefix client run lint   # ESLint with TypeScript + React hooks rules
```

ESLint is configured via `client/eslint.config.js`. The server has no linter configured — use the same ESLint rules when adding one.

---

## Important Constraints

1. **Always filter by `project_id`** in every database query — violating this breaks multi-tenancy.
2. **Never interpolate user input into SQL** — use `better-sqlite3` prepared statements.
3. **OSRM containers** are started/stopped per project via `OsrmService.ts`; do not bypass this service.
4. **File uploads** (GTFS import) must go through `@fastify/multipart` — do not read `req.body` directly.
5. **Frontend fetch calls** must go through the interceptor in `AuthContext` so the JWT and project ID are always included. Do not call `fetch` directly for API requests.
6. **Docker socket access** (`/var/run/docker.sock`) is required for OSRM management — ensure this is not exposed externally in production.
7. **TailwindCSS v4** is used — there is no `tailwind.config.js`; configuration is done via CSS `@theme` directives.

---

## Useful References

- GTFS Static spec: https://gtfs.org/schedule/reference/
- OSRM API: http://project-osrm.org/docs/v5.5.1/api/
- Fastify docs: https://fastify.dev/docs/latest/
- MapLibre GL JS: https://maplibre.org/maplibre-gl-js/docs/
- Keycloak Admin REST API: https://www.keycloak.org/docs-api/latest/rest-api/

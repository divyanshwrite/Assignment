# VedaAI — AI Assessment Creator

VedaAI is a full-stack assignment generator for teachers. Describe a topic, choose the question mix, and the platform builds a structured question paper plus answer key in the background. Progress streams to the browser in real time, and finished papers can be downloaded as PDFs or shared via expiring public links.

**Live demo**

- Frontend: <https://assignment-frontend-psi-ten.vercel.app>
- API: <https://assignment-ush6.onrender.com>

---

## Features

- **AI-powered question generation** with a configurable plan of MCQs, short, long, and case-study questions.
- **Background processing** with BullMQ + Redis so the UI stays responsive while the model works.
- **Live progress** over Socket.IO — the assignment page updates as the worker reaches each milestone.
- **Per-question editing and regeneration** so teachers can refine individual questions without rebuilding the paper.
- **PDF export** for both the question paper and a separate answer key, rendered with PDFKit.
- **Public share links** with a configurable TTL for sending papers to students or co-teachers.
- **Source material upload** — paste lesson notes or upload a PDF/TXT and the prompt builder folds it into the generation context.
- **Resilient generator** with deterministic fallbacks when the model returns malformed MCQs.

---

## Architecture

```
                      ┌──────────────────────┐
                      │  Next.js Frontend    │
                      │  (Vercel)            │
                      └──────────┬───────────┘
                                 │ HTTPS + WebSocket
                                 ▼
┌────────────────────────────────────────────────────────────┐
│  Express API + Socket.IO (Render)                          │
│  ─ /api/assignments  CRUD, regenerate, PDF, share          │
│  ─ /api/share/:token Public read-only paper                │
│  ─ Embedded BullMQ workers (generation + PDF rendering)    │
└──────┬───────────────────┬───────────────────┬─────────────┘
       │                   │                   │
       ▼                   ▼                   ▼
 ┌──────────┐        ┌────────────┐      ┌──────────────┐
 │ MongoDB  │        │ Upstash    │      │ OpenRouter   │
 │ Atlas    │        │ Redis      │      │ (LLM gateway)│
 └──────────┘        └────────────┘      └──────────────┘
```

Both BullMQ workers (generation and PDF rendering) run in-process with the API server by default, which keeps the deploy footprint small. They can be split into a separate process by setting `RUN_WORKERS=false` on the API and starting `npm run worker:start` elsewhere.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS, Zustand, Socket.IO client, lucide-react |
| Backend | Node.js, Express 4, Socket.IO, BullMQ, Mongoose, Zod, OpenAI SDK, PDFKit, pdf-parse, Multer |
| Data | MongoDB Atlas, Upstash Redis (TLS) |
| AI | OpenRouter (defaults to `z-ai/glm-4.5-air:free`); any OpenAI-compatible endpoint works |
| Hosting | Vercel (frontend), Render (backend), Upstash (Redis), Atlas (Mongo) |

---

## Repository layout

```
.
├── backend/                Express API + BullMQ workers (TypeScript, ESM)
│   ├── src/
│   │   ├── config/env.ts   Zod-validated environment loader
│   │   ├── db/             Mongo + Redis connectors
│   │   ├── models/         Mongoose schemas (Assignment, ShareToken)
│   │   ├── queues/         BullMQ queue definitions
│   │   ├── routes/         REST endpoints
│   │   ├── services/       Prompt builder, generator, PDF renderer, job state
│   │   ├── server.ts       HTTP + Socket.IO entrypoint (boots workers)
│   │   └── worker.ts       Standalone worker entrypoint
│   └── package.json
├── frontend/               Next.js 15 application (App Router)
│   ├── src/app/            Route segments and pages
│   ├── src/components/     UI building blocks
│   └── src/lib/            API client, socket client, shared types
├── docker-compose.yml      Local Mongo + Redis for development
└── README.md
```

---

## Getting started locally

### Prerequisites

- Node.js 20+ (Node 22+ recommended)
- Docker (optional, for one-command Mongo + Redis)
- An OpenRouter API key (or any OpenAI-compatible endpoint)

### 1. Clone and install

```bash
git clone https://github.com/divyanshwrite/Assignment.git
cd Assignment

# Install backend deps
cd backend
npm install

# Install frontend deps
cd ../frontend
npm install
```

### 2. Start MongoDB and Redis

The fastest path is Docker:

```bash
docker compose up -d
```

This starts Mongo on `27017` and Redis on `6379`. If you prefer hosted services, point the env vars below at Atlas and Upstash instead.

### 3. Configure environment variables

Copy the examples and fill in values:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

#### `backend/.env`

| Key | Description |
| --- | --- |
| `NODE_ENV` | `development` locally, `production` on Render |
| `PORT` | API port (defaults to `4000`) |
| `CLIENT_ORIGINS` | Comma-separated list of allowed frontend origins |
| `MONGODB_URI` | MongoDB connection string |
| `MONGODB_DNS_SERVERS` | Optional override (defaults to `8.8.8.8,1.1.1.1`) used for SRV lookups |
| `REDIS_URL` | Redis connection string (use `rediss://` for TLS) |
| `OPENAI_BASE_URL` | OpenAI-compatible endpoint (e.g. `https://openrouter.ai/api/v1`) |
| `OPENAI_API_KEY` | API key (leave blank to use the deterministic local generator) |
| `OPENAI_MODEL` | Model identifier (e.g. `z-ai/glm-4.5-air:free`) |
| `APP_NAME` | Branding string used in PDFs |
| `APP_PUBLIC_URL` | Public URL of the frontend (used for share links) |
| `RUN_WORKERS` | `true` (default) to boot workers in-process; `false` for split deploys |

#### `frontend/.env.local`

| Key | Description |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Base URL of the backend (e.g. `http://localhost:4000`) |

### 4. Run the dev servers

In two terminals:

```bash
# Terminal 1 — API + workers
cd backend
npm run dev

# Terminal 2 — Next.js app
cd frontend
npm run dev
```

Open <http://localhost:3000>.

> The API boots BullMQ workers automatically. If you'd rather run the worker as a separate process, start the API with `RUN_WORKERS=false` and run `npm run worker` in another terminal.

---

## API overview

All routes are prefixed with `/api`. JSON in, JSON out. PDF endpoints stream `application/pdf`.

### Assignments

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/assignments` | Create an assignment and queue generation. Accepts `multipart/form-data` with an optional `sourceFile`. |
| `GET` | `/api/assignments` | List assignments (most recent first). |
| `GET` | `/api/assignments/:id` | Fetch a single assignment with its generated paper. |
| `DELETE` | `/api/assignments/:id` | Delete an assignment. |
| `GET` | `/api/assignments/:id/state` | Get the latest job state cached in Redis. |
| `POST` | `/api/assignments/:id/regenerate` | Re-queue a full regeneration. |
| `GET` | `/api/assignments/:id/pdf` | Stream the question paper PDF. |
| `GET` | `/api/assignments/:id/answer-key.pdf` | Stream the answer key PDF. |

### Per-question controls

| Method | Path | Purpose |
| --- | --- | --- |
| `PATCH` | `/api/assignments/:id/questions/:qid` | Edit text, options, answer, difficulty, or marks for a single question. |
| `POST` | `/api/assignments/:id/questions/:qid/regenerate` | Queue a single-question regeneration. |

### Sharing

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/assignments/:id/share` | Create a share token (`ttlHours` body field, defaults to 7 days, max 30 days). |
| `GET` | `/api/assignments/:id/shares` | List share tokens for an assignment. |
| `GET` | `/api/share/:token` | Public, read-only paper view (used by the `/share/:token` frontend page). |

### Health

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness probe. |
| `GET` | `/ready` | Readiness probe (returns 503 until Mongo is connected). |

### Real-time events

Connect to the Socket.IO server, then `socket.emit("assignment:watch", assignmentId)` to join the room. The server emits `assignment:update` events as the worker progresses:

```ts
{
  assignmentId: string;
  status: "queued" | "processing" | "completed" | "failed" | "pdf-ready";
  progress: number;        // 0..100
  message: string;
}
```

---

## Deployment

The live deployment uses three free-tier services.

### 1. Upstash Redis

Create a database at <https://upstash.com>, enable TLS, and copy the **TCP** connection URL (format: `rediss://default:<token>@<host>:6379`). The REST URL is not used by this project.

### 2. MongoDB Atlas

Create a free shared cluster, add a database user, and allow `0.0.0.0/0` under Network Access. Make sure the connection string includes a database name (`/vedaai`).

### 3. Render — Web Service for the API

- Repository: this repo
- Root directory: `backend`
- Build command: `npm install --include=dev && npm run build`
- Start command: `npm start`
- Environment variables: every key from the `backend/.env` table above. Set `NODE_ENV=production` and point `CLIENT_ORIGINS` at your Vercel URL.

The API process embeds the BullMQ workers, so a single Render service is enough. To split them later, deploy a second service with start command `npm run worker:start` and set `RUN_WORKERS=false` on the API.

> The build command uses `--include=dev` because TypeScript types live in `devDependencies`. npm skips them when `NODE_ENV=production` unless you pass the flag.

### 4. Vercel — Next.js frontend

- Repository: this repo
- Root directory: `frontend`
- Environment variables: `NEXT_PUBLIC_API_URL` set to the Render API URL (no trailing slash).

`NEXT_PUBLIC_*` values are baked at build time, so updating this variable requires a redeploy.

### 5. Wire CORS

After Vercel hands you a URL, set `CLIENT_ORIGINS` on Render to that URL. Comma-separate additional origins (custom domain, preview deploys) as needed.

---

## Local scripts

### Backend (`backend/`)

| Script | Description |
| --- | --- |
| `npm run dev` | Starts the API + workers with `tsx watch`. |
| `npm run worker` | Starts only the workers. |
| `npm run build` | Compiles TypeScript to `dist/`. |
| `npm start` | Runs the compiled API. |
| `npm run worker:start` | Runs the compiled worker entrypoint. |
| `npm run typecheck` | Type-only check, no emit. |

### Frontend (`frontend/`)

| Script | Description |
| --- | --- |
| `npm run dev` | Starts Next.js in dev mode. |
| `npm run build` | Production build. |
| `npm start` | Serves the built app. |
| `npm run typecheck` | Type-only check. |

---

## Troubleshooting

- **`Production deployments must use external MONGODB_URI and REDIS_URL values.`** — Render is using a default that points at `localhost`. Set both variables on the service.
- **CORS error in the browser console.** — `CLIENT_ORIGINS` doesn't include the exact frontend origin. Use the URL from your address bar with no trailing slash.
- **Build fails on Render with `Cannot find namespace 'Express'` or missing `@types/*`.** — Use `npm install --include=dev && npm run build` as the build command.
- **Generation stalls at 5%.** — The workers aren't running. Check the API logs for `VedaAI workers are running.`; if missing, ensure `RUN_WORKERS` is unset or `true`.
- **Mongo SRV lookup fails locally (`querySrv ECONNREFUSED`).** — Your local resolver blocks Atlas SRV records. The app overrides DNS with `MONGODB_DNS_SERVERS` (defaults to Google + Cloudflare) at runtime.
- **Render free tier sleeps after 15 minutes idle.** — First request after idle takes ~30 seconds to wake. Upgrade to Starter for always-on.

---

## License

MIT — see [LICENSE](LICENSE) if present, otherwise treat as MIT for this repository.

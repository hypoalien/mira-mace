# Mira Mace take home

A small Next.js DME coordination app using the default neutral shadcn/ui components. The case view has a 60/40 workspace: streaming chat on the left and case progress on the right. One long-running Temporal workflow per case handles both chat and coordination through Temporal's Vercel AI SDK adapter. Its two mocked tools queue PCP and supplier outreach.

## Run locally

```bash
npm install
mkdir -p .local
temporal server start-dev --db-filename .local/temporal.db
# In another terminal:
npm run worker
# In another terminal:
npm run dev
```

Put `OPENAI_API_KEY=...` in an untracked `.env.worker.local` before starting the worker. Open http://localhost:3000. Use **Create case from intake** on the Cases page. Each click creates a new JSON record in `data/cases/` from `data/intake.json`; those records are local and ignored by Git. The supplier directory reads `data/suppliers.json` (all sample entries are treated as Medicare enrolled). Completed chat exchanges and DME coordination state are saved in the same case JSON and survive a refresh. **Reset case** replaces the stored case from the intake fixture, clears messages and coordination, and keeps the same case ID.

On a case page, click **Start DME agent** or send a chat message to start the case workflow. It loads fresh case context before making decisions and can queue mock supplier, PCP, and patient calls in the same round. For patient outreach, it asks only for details missing from the case and merges each answer into the JSON store. A right-side shadcn Sheet opens automatically for each newly pending call; **Simulate external responses** beside Reset case can reopen it. The Sheet closes after a response is saved. For a PCP answer, the order and mobility evaluation PDFs in `public/demo-documents/` are included by default and can be unchecked. These are locally authored, fictional records for the scenario; they are not records received from a practice. Regenerate them with `python3 scripts/generate-pcp-documents.py` (requires `reportlab`). **No response** schedules a next-day retry through a Temporal timer. The agent tries the next supplier until one can take a new Medicare patient, has K0001 in stock, and gives a delivery estimate.

## Docker

```bash
docker compose up --build
```

For local development, run the Temporal CLI, worker, and Next.js directly as shown above. The Temporal UI is at http://localhost:8233. The Docker Compose file is available if needed later and starts those three services in containers. The worker reads `OPENAI_API_KEY` from `.env.worker.local`; Next.js does not load this file. The checked-in `.env` contains only local defaults and no secrets.

## API

`POST /api/cases` creates a new case from the fixed intake fixture and returns it with HTTP 201 and a `Location` header. The case store is a local JSON prototype shared by the Next.js process and Temporal worker on one filesystem.

`POST /api/cases/:id/chat` accepts `{ "message": "..." }` and returns newline-delimited `delta`, `done`, or `error` events. It signals the same case workflow used for coordination; only one chat turn can run per case, and a concurrent request receives HTTP 409. The AI SDK plugin performs the model call as an Activity and Workflow Streams carries text to the browser. A Temporal Activity appends the completed exchange to the latest case JSON using the turn ID to prevent duplicates. This write survives browser disconnection and completes before `done` is sent. `POST /api/cases/:id/reset` replaces the case JSON with a fresh case from the intake fixture while preserving its ID; old workflows cannot write into the reset case.

`POST /api/cases/:id/dme/start` starts the one long-running case workflow for the current case generation. `POST /api/cases/:id/dme/respond` records one mocked PCP or supplier outcome and signals that workflow. Tool calls only create case JSON records; they do not contact external systems. Temporal Activities perform the JSON writes, and the workflow waits on signals, chat turns, or next-day timers without keeping an HTTP request open.

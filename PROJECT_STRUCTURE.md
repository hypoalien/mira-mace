# Project structure and code map

This document describes the current `mira-mace-takehome` checkout. It covers every project-owned file and folder, including local runtime entries. The individual shadcn/ui primitives in `src/components/ui/` are named in the tree but excluded from the file-by-file function descriptions, as requested. App-specific components in `src/components/` are included because they contain case behavior.

## At a glance

- **Next.js** serves the case list, case details, supplier directory, and API routes.
- **JSON files** are the demo's data store: `data/intake.json` is the case template, `data/suppliers.json` is the directory, and `data/cases/CASE-*.json` stores each live case, including messages, calls, documents, confirmed patient details, and coordination state.
- **One Temporal workflow per case** (`dmeCaseWorkflow`) handles both proactive DME coordination and advocate chat. Its Activities read and write the JSON store. Chat streams through Temporal Workflow Streams to the browser.
- **`src/ai/` owns model behavior:** the DME and chat invocation functions share the same prompt, case-context builder, and thin mock-contact tools. The Temporal workflow supplies the model and Activities.
- **External calls are simulated.** Tool execution creates pending PCP, supplier, or patient calls in the case JSON. A human submits mock answers from the case page.

## File and folder tree

```text
mira-mace-takehome/
├── .dockerignore
├── .env
├── .env.example
├── .env.worker.local                 # local, ignored worker secret; contents omitted
├── .gitignore
├── AGENTS.md
├── Dockerfile
├── README.md
├── PROJECT_STRUCTURE.md             # this document
├── components.json
├── compose.yaml
├── eslint.config.mjs
├── next-env.d.ts
├── next.config.ts
├── package-lock.json
├── package.json
├── postcss.config.mjs
├── tsconfig.json
├── data/
│   ├── intake.json
│   ├── suppliers.json
│   └── cases/
│       ├── .gitkeep
│       └── CASE-*.json               # ignored, generated case records
├── public/
│   └── demo-documents/
│       ├── mobility-clinical-records.pdf
│       └── signed-wheelchair-order.pdf
├── scripts/
│   └── generate-pcp-documents.py
└── src/
    ├── ai/
    │   ├── context.ts
    │   ├── prompts.ts
    │   ├── agents/
    │   │   ├── chat-agent.ts
    │   │   └── dme-agent.ts
    │   └── tools/
    │       ├── contact-patient.ts
    │       ├── contact-pcp.ts
    │       ├── contact-supplier.ts
    │       └── index.ts
    ├── app/
    │   ├── globals.css
    │   ├── icon.svg
    │   ├── layout.tsx
    │   ├── page.tsx
    │   ├── cases/
    │   │   └── [id]/
    │   │       └── page.tsx
    │   ├── suppliers/
    │   │   └── page.tsx
    │   └── api/
    │       └── cases/
    │           ├── route.ts
    │           └── [id]/
    │               ├── chat/
    │               │   └── route.ts
    │               ├── dme/
    │               │   ├── respond/
    │               │   │   └── route.ts
    │               │   └── start/
    │               │       └── route.ts
    │               └── reset/
    │                   └── route.ts
    ├── components/
    │   ├── app-nav.tsx
    │   ├── case-chat-panel.tsx
    │   ├── case-detail-header.tsx
    │   ├── case-status-panel.tsx
    │   ├── create-case-button.tsx
    │   ├── dme-controls.tsx
    │   ├── reset-case-button.tsx
    │   └── ui/                         # shadcn primitives; details excluded below
    │       ├── badge.tsx
    │       ├── button.tsx
    │       ├── card.tsx
    │       ├── checkbox.tsx
    │       ├── input.tsx
    │       ├── label.tsx
    │       ├── select.tsx
    │       ├── separator.tsx
    │       ├── sheet.tsx
    │       ├── table.tsx
    │       └── textarea.tsx
    ├── lib/
    │   ├── cases.ts
    │   ├── dme-constants.ts
    │   ├── dme/
    │   │   ├── cases.ts
    │   │   ├── contact-patient.ts
    │   │   ├── contact-pcp.ts
    │   │   ├── contact-supplier.ts
    │   │   └── responses.ts
    │   ├── suppliers.ts
    │   ├── utils.ts
    │   └── temporal/
    │       ├── case-chat-stream.ts
    │       ├── client.ts
    │       └── start-case-workflow.ts
    └── temporal/
        ├── worker.ts
        ├── workflows.ts
        └── dme/
            ├── activities.ts
            ├── constants.ts
            ├── signals.ts
            └── workflow.ts
```

The Next.js `[id]` folders supply the case ID from the URL. The `api/` folders define HTTP endpoints. `src/lib/` runs in the Next.js server and in Temporal Activities. `src/ai/` contains model-facing code that can be bundled into a Temporal workflow; `src/temporal/` owns workflow orchestration and the worker.

## Root files

| File | Purpose |
| --- | --- |
| `README.md` | Setup, local run commands, and API/use notes. |
| `PROJECT_STRUCTURE.md` | This inventory and function map. |
| `AGENTS.md` | Repository-specific development instructions generated for the local Next.js version. |
| `package.json` | Dependencies and commands: `dev`, `build`, `start`, `worker`, `lint`, `typecheck`. |
| `package-lock.json` | Exact npm dependency resolution. |
| `tsconfig.json` | Strict TypeScript settings and the `@/*` import alias. |
| `next-env.d.ts` | Next.js-generated TypeScript declarations. |
| `next.config.ts` | Next.js configuration, including standalone output and Turbopack root. |
| `eslint.config.mjs` | ESLint configuration for Next.js and TypeScript. |
| `postcss.config.mjs` | Tailwind CSS PostCSS integration. |
| `components.json` | shadcn/ui CLI aliases, styles, and component configuration. |
| `.env` | Local non-secret app configuration. |
| `.env.example` | Configuration template for another checkout. |
| `.env.worker.local` | Ignored local worker environment, including the model API key; its values are intentionally not documented. |
| `.gitignore` | Keeps generated output, local secrets, and live case records out of Git. |
| `.dockerignore` | Keeps local/generated files out of Docker build context. |
| `Dockerfile` | Multi-stage image build for the web app and Temporal worker. |
| `compose.yaml` | Optional Docker-based Temporal, worker, and web setup. Local development can run the app and worker directly. |

These root files are configuration or documentation; they do not define application functions.

## Data, documents, and scripts

| File or folder | Purpose and functions |
| --- | --- |
| `data/intake.json` | Source case intake with patient name/age, equipment, and PCP information. It intentionally has no patient contact, delivery, insurance, or home-accessibility details; those are collected through the patient mock call. `readIntake()` validates it, and creation/reset copy it into a case record. |
| `data/suppliers.json` | Supplier directory fixture. `listSuppliers()` validates and reads it. |
| `data/cases/.gitkeep` | Keeps the case-store directory present in Git. |
| `data/cases/CASE-*.json` | Generated persistent record per case. Holds intake, messages, active chat reservation, generation ID, call attempts, attached document references, selected supplier, and status summary. Files are ignored by Git. |
| `public/demo-documents/signed-wheelchair-order.pdf` | Local sample signed-order attachment offered for a mock PCP response. |
| `public/demo-documents/mobility-clinical-records.pdf` | Local sample clinical-records attachment offered for a mock PCP response. |
| `scripts/generate-pcp-documents.py` | Regenerates both sample PDFs from intake data with ReportLab. Its `page_frame()`, `document()`, `fields()`, and `section()` helpers draw and lay out the documents. |

## Next.js app (`src/app/`)

| File | Main functions and behavior |
| --- | --- |
| `layout.tsx` | `RootLayout()` supplies the page shell, global CSS, and metadata. |
| `page.tsx` | `CasesPage()` calls `listCases()` and renders the all-cases page. |
| `cases/[id]/page.tsx` | `CasePage()` loads a case with `getCase()`, loads the supplier count, handles a missing ID, and composes the case details, chat, status, and controls. |
| `suppliers/page.tsx` | `SuppliersPage()` loads and renders the supplier directory. |
| `globals.css` | Tailwind imports, theme tokens, and global element styles. No functions. |
| `icon.svg` | App favicon. No functions. |

### HTTP routes (`src/app/api/cases/`)

| File / endpoint | Main functions and behavior |
| --- | --- |
| `route.ts` — `POST /api/cases` | `POST()` creates a new case from `data/intake.json` with `createCaseFromIntake()`. Returns the case and its detail-page URL. |
| `[id]/dme/start/route.ts` — `POST /api/cases/:id/dme/start` | `POST()` calls `ensureCaseWorkflow()` to start or reuse the case's single Temporal workflow. It signals a reused workflow to re-evaluate the case, including an existing ready case missing patient details. |
| `[id]/chat/route.ts` — `POST /api/cases/:id/chat` | `POST()` validates a message, ensures that same case workflow exists, reserves one active chat turn with `claimCaseChat()`, signals `chat-requested`, then returns a streamed response. It releases the reservation if signaling fails. |
| `[id]/dme/respond/route.ts` — `POST /api/cases/:id/dme/respond` | `POST()` validates a simulated PCP, supplier, or patient answer, saves it with `recordMockResponse()`, and signals `case-updated` so the workflow can continue. A `no_response` answer schedules a follow-up. |
| `[id]/reset/route.ts` — `POST /api/cases/:id/reset` | `POST()` rebuilds the JSON case from intake using the **same ID**, clearing chat and coordination state. It then attempts to cancel the old workflow; the new generation ID also prevents stale writes. |

## App-specific components (`src/components/`)

These files contain case-specific presentation and interaction. The default shadcn primitives under `src/components/ui/` are intentionally excluded from this table.

| File | Main functions and behavior |
| --- | --- |
| `app-nav.tsx` | `AppNav()` renders top-level navigation. |
| `case-chat-panel.tsx` | `CaseChatPanel()` renders saved messages, the current turn, composer, loading and error states. Its `send()` posts to the chat route and updates the visible reply as chunks arrive. `readChatStream()` parses newline-delimited `delta`, `done`, and `error` events. It refreshes case data while coordination runs. |
| `case-detail-header.tsx` | `CaseDetailHeader()` renders intake identity/equipment/PCP information and shows confirmed phone, address, and insurance only after a patient response. `formatTime()` formats timestamps. |
| `case-status-panel.tsx` | `CaseStatusPanel()` summarizes documents, supplier/PCP/patient calls, confirmed patient details, selected supplier, and agent state. `StatusItem()` renders one label/value row. |
| `create-case-button.tsx` | `CreateCaseButton()` renders case creation controls. Its `createCase()` posts to `/api/cases` and navigates to the new case. |
| `dme-controls.tsx` | `DmeControls()` starts or resumes coordination, shows pending mock calls, and auto-opens a right-side shadcn `Sheet` when a new response is needed; `start()` posts to the start route. `MockCallForm()` collects PCP documents, supplier answers, or patient contact/delivery/insurance/accessibility details from blank fields; its `submit()` posts to the response route and closes the sheet after success. |
| `reset-case-button.tsx` | `ResetCaseButton()` renders the reset control. Its `reset()` posts to the reset route and refreshes the current case page. |

## Model-facing code (`src/ai/`)

This folder contains the prompts, case context, tool schemas, and AI SDK calls used by the one case workflow. Its runtime dependencies are supplied by the Temporal workflow, so it does not directly read the JSON store or open network connections.

| File | Main functions and behavior |
| --- | --- |
| `prompts.ts` | `DME_AGENT_INSTRUCTIONS` is the shared system prompt for proactive coordination and advocate chat. |
| `context.ts` | `prepareAgentStep()` reloads authoritative case and supplier context through an injected Activity, adds that context to the model instructions, and enables only useful PCP/supplier/patient tools for the next model step. `LoadDmeContext` is its dependency type. |
| `agents/dme-agent.ts` | `runDmeAgent()` performs one proactive `generateText()` coordination round using the injected model and Activities. |
| `agents/chat-agent.ts` | `runChatAgent()` runs a `streamText()` chat turn with recent saved messages, the new user message, shared tools and refreshed context. It collects and returns the final answer; the Temporal workflow owns persistence and stream completion. |
| `tools/contact-pcp.ts` | `createContactPCPTool()` defines the PCP tool description and input schema, then passes the tool call ID and arguments to the injected contact Activity. |
| `tools/contact-patient.ts` | `createContactPatientTool()` defines the model-facing mock patient contact tool. The model chooses a subset of missing patient fields and writes the questions; case identity remains application-controlled. |
| `tools/contact-supplier.ts` | `createContactSupplierTool()` does the same for the next eligible supplier; `requirements` become the contact Activity's extra questions. |
| `tools/index.ts` | `createCoordinationTools()` assembles all three tools for either agent. `ContactActivities` describes the injected contact functions. |

## Server-side case and DME code (`src/lib/`)

### `cases.ts` — JSON store and case lifecycle

Zod schemas in this file validate intake, chat messages, active chat turns, calls, documents, confirmed patient details, coordination state, and full case records. It exports the `Case`, `Intake`, `CaseMessage`, `CaseCall`, `CaseDocument`, and `PatientDetails` types.

| Function | Role |
| --- | --- |
| `casePath()` | Validates a case ID before constructing its JSON filename. |
| `withCaseWrite()` | Serializes writes to one case using a short-lived lock directory; handles stale locks. |
| `writeCase()` | Validates and atomically replaces a case JSON file through a temporary file and rename. |
| `readIntake()` | Reads and validates `data/intake.json`. |
| `freshCase()` | Creates an empty case value from intake, with a fresh generation ID. |
| `createCaseFromIntake()` | Creates a new ID and writes its first case JSON file exclusively. |
| `getCase()` | Loads and validates one case, or returns `null` if absent. |
| `updateCase()` | Runs a read/modify/write transaction under the per-case lock. |
| `claimCaseChat()` | Reserves one active chat turn per case; returns `busy` if another is active. |
| `completeCaseChat()` | Saves user and assistant messages together after generation, using `turnId` for idempotency and `generation` to reject stale results. |
| `releaseCaseChat()` | Clears a matching reservation when a turn fails. |
| `resetCase()` | Replaces the case with fresh intake using the existing case ID. |
| `listCases()` | Reads and sorts all saved case JSON files for the list page. |

### `dme/` — coordination business logic

The AI tools in `src/ai/tools/` define the model-facing interface; these files implement the case changes behind those tools. `DmeAction` carries case/generation/workflow identity; `ContactInput` adds tool-call identity, reason, and questions.

| File and function | Role |
| --- | --- |
| `cases.ts` — `matches()` | Guards writes against a reset case or replaced workflow. |
| `cases.ts` — `startDmeCase()` | Reserves a workflow ID in the case JSON, reusing a valid one or replacing a stopped one. |
| `cases.ts` — `releaseDmeStart()` | Clears that reservation if Temporal start fails. |
| `cases.ts` — `loadDmeContext()` | Loads the current case and supplier directory for an active workflow generation. |
| `cases.ts` — `markAgentRunning()` | Marks coordination as running. |
| `cases.ts` — `getNextFollowUpAt()` | Finds the earliest scheduled follow-up. |
| `cases.ts` — `dispatchDueFollowUps()` | Moves due scheduled calls back to awaiting response and increments their attempt count. |
| `cases.ts` — `recordAgentRound()` | Recomputes `waiting`, `ready`, or `blocked` status and a human-readable summary. Ready now requires PCP documents, a qualifying supplier, and confirmed patient details. |
| `contact-patient.ts` — `contactPatient()` | Queues an idempotent mock patient call for the missing details selected by the model. It rejects duplicate or already-confirmed fields and saves the field-to-question mapping with the call. |
| `cases.ts` — `recordAgentError()` | Marks coordination as errored after an unhandled workflow failure. |
| `contact-pcp.ts` — `contactPCP()` | Queues an idempotent mock PCP call for missing order/clinical documents. Records the supplier-call list at the time of this call, which may be empty. |
| `contact-supplier.ts` — `contactSupplier()` | Queues an idempotent mock call to the next uncontacted Medicare-enrolled supplier; adds the required intake, K0001 stock, and delivery questions. |
| `responses.ts` — `recordMockResponse()` | Validates and saves an answered call, selected PCP attachments, supplier qualification, or structured patient details. A no-answer response schedules a next-day retry using its `nextDay()` helper. |

### Other `src/lib/` files

| File | Main functions and behavior |
| --- | --- |
| `dme-constants.ts` | `DEMO_DOCUMENTS` maps each required PCP document kind to its name and local PDF URL. |
| `suppliers.ts` | `supplierSchema` validates directory entries; `listSuppliers()` reads `data/suppliers.json`. |
| `utils.ts` | Re-exports the `cn()` class-name helper used by UI styling. |
| `temporal/client.ts` | `createTemporalClient()` opens a Temporal client connection and returns a `close()` function. |
| `temporal/start-case-workflow.ts` | `ensureCaseWorkflow()` checks whether the stored workflow is running, starts/replaces it as needed on the case task queue, and rolls back a failed start. |
| `temporal/case-chat-stream.ts` | `createCaseChatResponse()` subscribes to a turn's Workflow Streams text and completion topics, converts model chunks to newline-delimited JSON for the browser, and closes the Temporal connection when finished. A browser disconnect does not stop workflow-side persistence. |

## Temporal worker and workflow (`src/temporal/`)

| File | Main functions and behavior |
| --- | --- |
| `worker.ts` | `main()` loads the ignored worker environment, connects to Temporal, registers the workflow bundle and DME Activities with the Temporal AI SDK plugin, then polls the case task queue. |
| `workflows.ts` | Exports `dmeCaseWorkflow` for Temporal's workflow bundler. |
| `dme/constants.ts` | `CASE_TASK_QUEUE` names the worker queue. `chatTextTopic()` and `chatCompletionTopic()` create per-turn stream topic names; `ChatCompletion` describes success/error completion. |
| `dme/signals.ts` | Defines the `caseUpdated` and `chatRequested` Temporal signals. |
| `dme/activities.ts` | Re-exports case/DME store functions as Temporal Activities, including chat persistence (`persistChatExchange`) and reservation cleanup (`releaseChatReservation`). |
| `dme/workflow.ts` | Defines the one long-running case workflow. `runCoordination()` marks the case running, invokes `runDmeAgent()`, then records the round. `runChat()` validates the active turn, invokes `runChatAgent()` with a streaming Temporal model, persists the final exchange, and publishes completion or error. `dmeCaseWorkflow()` handles buffered chat/update signals and durable next-day follow-up timers until reset or workflow end. |

## Local/generated entries

These exist in the current checkout but are generated or local state, so their internal files are not part of the source map:

| Entry | Purpose |
| --- | --- |
| `.git/` | Local Git metadata. |
| `.next/` | Next.js development/build output. |
| `node_modules/` | Installed npm packages. |
| `.local/` | Local Temporal runtime data. |
| `.playwright-cli/` | Local browser-test artifacts. |
| `tsconfig.tsbuildinfo` | TypeScript incremental-build cache. |
| `data/cases/*.json.lock/` and `*.tmp` | Short-lived lock and temporary-write entries, only present while a case write is underway. |

## Main paths through the code

1. **Create:** `CreateCaseButton` → `POST /api/cases` → `createCaseFromIntake()` → `data/cases/CASE-*.json` → case detail page.
2. **Start coordination:** `DmeControls` → `POST /dme/start` → `ensureCaseWorkflow()` → `dmeCaseWorkflow()` → `runDmeAgent()` → mock-contact Activities → case JSON.
3. **Answer a mock call:** `MockCallForm` → `POST /dme/respond` → `recordMockResponse()` → `case-updated` signal → the same workflow resumes. No response creates a next-day follow-up in JSON and the workflow waits on a Temporal timer.
4. **Chat:** `CaseChatPanel` → `POST /chat` → `claimCaseChat()` → `chat-requested` signal → workflow `runChat()` → `runChatAgent()` → Workflow Streams → `createCaseChatResponse()` → browser. `completeCaseChat()` saves the final exchange to the same case JSON.
5. **Reset:** `ResetCaseButton` → `POST /reset` → `resetCase()` reads the latest intake, replaces the JSON with the same case ID and a new generation, and cancels the previous workflow when possible.

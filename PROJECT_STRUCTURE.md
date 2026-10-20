# Project structure and code map

This document describes the current `mira-mace-takehome` checkout. It covers every project-owned file and folder, including local runtime entries. The individual shadcn/ui primitives in `src/components/ui/` are named in the tree but excluded from the file-by-file function descriptions, as requested. App-specific components in `src/components/` are included because they contain case behavior.

## At a glance

- **Next.js** serves the case list, case details, supplier directory, and API routes.
- **JSON files** are the demo's data store: `data/intake.json` is the case template, `data/suppliers.json` is the directory, and `data/cases/CASE-*.json` stores each live case, including messages, calls, documents, patient details, care advocate tasks, and coordination state.
- **One Temporal workflow per case** (`dmeCaseWorkflow`) handles both proactive DME coordination and advocate chat. Its Activities read and write the JSON store. Chat streams through Temporal Workflow Streams to the browser.
- **`src/ai/` owns model behavior:** the DME and chat invocation functions share the same prompt, case-context builder, and thin mock-contact tools. The Temporal workflow supplies the model and Activities.
- **External calls are simulated.** Tool execution creates pending PCP, supplier, or patient calls in the case JSON. A human submits mock answers from `/cases/[id]/external`.

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
    │   │   ├── collect-agent-stream.ts
    │   │   └── dme-agent.ts
    │   └── tools/
    │       ├── book-delivery.ts
    │       ├── confirm-patient-arrangement.ts
    │       ├── contact-patient.ts
    │       ├── contact-pcp.ts
    │       ├── contact-supplier.ts
    │       ├── index.ts
    │       ├── notify-patient.ts
    │       ├── request-human-assistance.ts
    │       ├── request-supplier-offer.ts
    │       └── verify-delivery.ts
    ├── app/
    │   ├── globals.css
    │   ├── icon.svg
    │   ├── layout.tsx
    │   ├── page.tsx
    │   ├── cases/
    │   │   └── [id]/
    │   │       ├── page.tsx
    │   │       └── external/
    │   │           └── page.tsx
    │   ├── suppliers/
    │   │   └── page.tsx
    │   └── api/
    │       └── cases/
    │           ├── route.ts
    │           └── [id]/
    │               ├── chat/
    │               │   └── route.ts
    │               ├── dme/
    │               │   ├── draft-response/
    │               │   │   └── route.ts
    │               │   ├── respond/
    │               │   │   └── route.ts
    │               │   └── start/
    │               │       └── route.ts
    │               ├── human-tasks/
    │               │   └── [taskId]/
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
    │   ├── external-responses.tsx
    │   ├── fulfillment-response-fields.tsx
    │   ├── human-tasks-panel.tsx
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
    │   ├── chat-activity.ts
    │   ├── dme-constants.ts
    │   ├── patient-details.ts
    │   ├── dme/
    │   │   ├── book-delivery.ts
    │   │   ├── cases.ts
    │   │   ├── delivery-windows.ts
    │   │   ├── contact-patient.ts
    │   │   ├── contact-pcp.ts
    │   │   ├── contact-supplier.ts
    │   │   ├── extract-patient-details.ts
    │   │   ├── fulfillment.ts
    │   │   ├── fulfillment-responses.ts
    │   │   ├── human-tasks.ts
    │   │   ├── notify-patient.ts
    │   │   ├── patient-arrangement.ts
    │   │   ├── responses.ts
    │   │   ├── supplier-offer.ts
    │   │   └── verify-delivery.ts
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
| `data/intake.json` | Source case intake with patient name, age, insurance, supplemental coverage status, equipment, and PCP information. Patient contact, delivery, and home-accessibility details are collected through the patient mock call. `readIntake()` validates it, and creation/reset copy it into a case record. |
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
| `cases/[id]/external/page.tsx` | `ExternalResponsesPage()` loads the same case and renders the mock-response workspace in its own tab. |
| `suppliers/page.tsx` | `SuppliersPage()` loads and renders the supplier directory. |
| `globals.css` | Tailwind imports, theme tokens, and global element styles. No functions. |
| `icon.svg` | App favicon. No functions. |

### HTTP routes (`src/app/api/cases/`)

| File / endpoint | Main functions and behavior |
| --- | --- |
| `route.ts` — `POST /api/cases` | `POST()` creates a new case from `data/intake.json` with `createCaseFromIntake()`. Returns the case and its detail-page URL. |
| `[id]/dme/start/route.ts` — `POST /api/cases/:id/dme/start` | `POST()` calls `ensureCaseWorkflow()` to start or reuse the case's single Temporal workflow. It signals a reused workflow to re-evaluate the case, including an existing ready case missing patient details. |
| `[id]/chat/route.ts` — `POST /api/cases/:id/chat` | `POST()` validates a message, ensures that same case workflow exists, reserves one active chat turn with `claimCaseChat()`, signals `chat-requested`, then returns a streamed response. It releases the reservation if signaling fails. |
| `[id]/dme/respond/route.ts` — `POST /api/cases/:id/dme/respond` | `POST()` validates a simulated PCP, supplier, or patient outcome, saves it with `recordMockResponse()`, and signals `case-updated`. A fourth unanswered attempt escalates. |
| `[id]/dme/draft-response/route.ts` — `POST /api/cases/:id/dme/draft-response` | `POST()` uses the AI SDK to draft structured mock answers for one pending call. It fills the external-page form without submitting the response. |
| `[id]/human-tasks/[taskId]/route.ts` — `POST /api/cases/:id/human-tasks/:taskId` | `POST()` saves an advocate resolution, ensures the case workflow is running, and signals `case-updated` so coordination resumes. |
| `[id]/reset/route.ts` — `POST /api/cases/:id/reset` | `POST()` rebuilds the JSON case from intake using the **same ID**, clearing chat and coordination state. It then attempts to cancel the old workflow; the new generation ID also prevents stale writes. |

## App-specific components (`src/components/`)

These files contain case-specific presentation and interaction. The default shadcn primitives under `src/components/ui/` are intentionally excluded from this table.

| File | Main functions and behavior |
| --- | --- |
| `app-nav.tsx` | `AppNav()` renders top-level navigation. |
| `case-chat-panel.tsx` | `CaseChatPanel()` renders saved messages, live background coordination activity, tool results, composer, loading and error states. Its `send()` posts to the chat route and updates the reply as chunks arrive. `readChatStream()` parses text, tool activity, completion, and error events. It refreshes case data while coordination runs. |
| `case-detail-header.tsx` | `CaseDetailHeader()` renders intake identity, insurance, equipment, and PCP information, plus confirmed phone and address after a patient response. `formatTime()` formats timestamps. |
| `case-status-panel.tsx` | `CaseStatusPanel()` summarizes coordination, the supplier offer, patient agreement, booking, notification, delivery evidence, and agent state. `StatusItem()` renders one label/value row. |
| `create-case-button.tsx` | `CreateCaseButton()` renders case creation controls. Its `createCase()` posts to `/api/cases` and navigates to the new case. |
| `dme-controls.tsx` | `DmeControls()` starts or resumes coordination, shows pending mock calls, and opens the external-response route in a new tab. |
| `external-responses.tsx` | `ExternalResponses()` refreshes pending calls and selects one to answer. `MockCallForm()` collects answers; `draftAnswers()` fills an editable AI draft, and `submit()` saves the chosen response. |
| `fulfillment-response-fields.tsx` | `FulfillmentResponseFields()` renders the purpose-specific mock supplier and patient fields for offer, agreement, booking, and delivery replies. |
| `human-tasks-panel.tsx` | `HumanTasksPanel()` lists pending and resolved advocate tasks. `PendingTask()` collects a resolution and posts it to the task route. |
| `reset-case-button.tsx` | `ResetCaseButton()` renders the reset control. Its `reset()` posts to the reset route and refreshes the current case page. |

## Model-facing code (`src/ai/`)

This folder contains the prompts, case context, tool schemas, and AI SDK calls used by the one case workflow. Its runtime dependencies are supplied by the Temporal workflow, so it does not directly read the JSON store or open network connections.

| File | Main functions and behavior |
| --- | --- |
| `prompts.ts` | `DME_AGENT_INSTRUCTIONS` is the shared system prompt for proactive coordination and advocate chat. |
| `context.ts` | `prepareAgentStep()` reloads authoritative case, supplier, fulfillment, and advocate-task context through an injected Activity, adds it to model instructions, and enables tools whose prerequisites are met. `LoadDmeContext` is its dependency type. |
| `agents/dme-agent.ts` | `runDmeAgent()` performs one proactive streamed coordination round using the injected model and Activities. It requires a useful outreach tool while one is available. |
| `agents/chat-agent.ts` | `runChatAgent()` runs a `streamText()` chat turn with recent saved messages, the new user message, shared tools and refreshed context. It collects and returns the final answer; the Temporal workflow owns persistence and stream completion. |
| `agents/collect-agent-stream.ts` | `collectAgentStream()` reads model text and tool start/result events for both agent paths. |
| `tools/contact-pcp.ts` | `createContactPCPTool()` defines the PCP tool description and input schema, then passes the tool call ID and arguments to the injected contact Activity. |
| `tools/contact-patient.ts` | `createContactPatientTool()` defines the model-facing mock patient contact tool. The model chooses a subset of missing patient fields and writes the questions; case identity remains application-controlled. |
| `tools/contact-supplier.ts` | `createContactSupplierTool()` does the same for the next eligible supplier; `requirements` become the contact Activity's extra questions. |
| `tools/request-supplier-offer.ts` | `createRequestSupplierOfferTool()` lets the agent ask the selected supplier for cost, rental terms, and delivery windows. |
| `tools/confirm-patient-arrangement.ts` | `createConfirmPatientArrangementTool()` queues an explicit patient agreement request using recorded offer facts. |
| `tools/book-delivery.ts` | `createBookDeliveryTool()` lets the agent request the patient's agreed slot; the business service enforces agreement and waits for supplier confirmation. |
| `tools/notify-patient.ts` | `createNotifyPatientTool()` records a simulated notification after a confirmed booking. |
| `tools/verify-delivery.ts` | `createSupplierDeliveryEvidenceTool()` and `createPatientDeliveryConfirmationTool()` request the two independent delivery confirmations. |
| `tools/request-human-assistance.ts` | `createHumanAssistanceTool()` lets the agent create a care advocate task after all enrolled supplier options are exhausted. Blocked and repeatedly unanswered calls create tasks in the response handler. |
| `tools/index.ts` | `createCoordinationTools()` assembles outreach, fulfillment, and human-assistance tools for either agent. `ContactActivities` describes the injected Activities. |

## Server-side case and DME code (`src/lib/`)

### `cases.ts` — JSON store and case lifecycle

Zod schemas in this file validate intake, chat messages, active chat turns, calls, documents, human tasks, coordination state, fulfillment evidence, and full case records. It exports the `Case`, `Intake`, `CaseMessage`, `CaseCall`, `CaseDocument`, `PatientDetails`, `DeliverySlot`, `Fulfillment`, and `HumanTask` types. `patient-details.ts` owns the shared patient-details schema so Temporal can bundle readiness checks without filesystem code.

| Function | Role |
| --- | --- |
| `casePath()` | Validates a case ID before constructing its JSON filename. |
| `withCaseWrite()` | Serializes writes to one case using a short-lived lock directory; handles stale locks. |
| `writeCase()` | Validates and atomically replaces a case JSON file through a temporary file and rename. |
| `deriveCaseStatus()` | Derives the visible case status from current calls, advocate tasks, coordination state, and fulfillment evidence. |
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
| `cases.ts` — `beginCoordinationRound()` | Adds a durable “Thinking…” assistant entry when a background round starts. |
| `cases.ts` — `recordCoordinationActivity()` | Saves a tool call's running/completed state, request, and result on that entry. |
| `cases.ts` — `recordCoordinationFailure()` | Replaces a failed round's loading text with an error message. |
| `cases.ts` — `getNextFollowUpAt()` | Finds the earliest scheduled follow-up. |
| `cases.ts` — `dispatchDueFollowUps()` | Moves due scheduled calls back to awaiting response and increments their attempt count. |
| `cases.ts` — `recordAgentRound()` | Recomputes `waiting`, `blocked`, or `completed` status and a human-readable summary from recorded evidence. |
| `contact-patient.ts` — `contactPatient()` | Queues an idempotent mock patient call for the missing details selected by the model. It rejects duplicate or already-confirmed fields and saves the field-to-question mapping with the call. |
| `cases.ts` — `recordAgentError()` | Marks coordination as errored after an unhandled workflow failure. |
| `contact-pcp.ts` — `contactPCP()` | Queues an idempotent mock PCP call for missing order/clinical documents. Records the supplier-call list at the time of this call, which may be empty. |
| `contact-supplier.ts` — `contactSupplier()` | Queues an idempotent mock call to the next uncontacted Medicare-enrolled supplier; adds the required intake, K0001 stock, and delivery questions. |
| `fulfillment.ts` — `hasCoordinationReadiness()`, `hasValidAgreement()`, `hasConfirmedBooking()`, `getFulfillmentStage()`, `hasOpenCall()` | Computes stage and tool prerequisites from recorded documents, supplier, patient details, offer, agreement, booking, notification, and delivery evidence. |
| `delivery-windows.ts` — `validateDeliveryWindows()`, `suggestedDeliveryWindows()` | Rejects malformed or past offer windows and generates future business-day mock windows for the draft button. |
| `supplier-offer.ts` — `requestSupplierOffer()` | Queues a mock offer request for the selected supplier; permits a revised offer after a rejected booking. |
| `patient-arrangement.ts` — `confirmPatientArrangement()` | Queues patient acceptance, address, and slot questions only after coordination and the offer are ready. |
| `book-delivery.ts` — `bookDelivery()` | Atomically checks agreement and the exact offered slot, then queues a supplier booking request as pending. |
| `notify-patient.ts` — `notifyPatient()` | Records a simulated notification assembled only from confirmed booking and offer facts; deduplicates by booking call ID. |
| `verify-delivery.ts` — `requestSupplierDeliveryEvidence()`, `requestPatientDeliveryConfirmation()` | Queues the two mock delivery checks after notification. |
| `fulfillment-responses.ts` — `applyFulfillmentAnswer()` | Validates and records offer, agreement, booking, and delivery evidence; creates advocate tasks for refusal or delivery issues. |
| `responses.ts` — `recordMockResponse()` | Saves answered calls, reported blockers, documents, supplier qualification, and patient details. A no-answer response schedules the next day for attempts 1–3 and creates an advocate task after attempt 4. |
| `extract-patient-details.ts` — `extractPatientDetails()` | Uses validated AI SDK structured output to normalize patient phone and home/delivery addresses from mock answers before persistence. |
| `human-tasks.ts` — `addHumanTask()`, `createHumanTask()`, `resolveHumanTask()` | Deduplicates and saves advocate tasks from deterministic escalation or the agent tool, then records advocate resolutions. |

### Other `src/lib/` files

| File | Main functions and behavior |
| --- | --- |
| `chat-activity.ts` | `chatActivitySchema` validates persisted tool events; `formatToolValue()` turns tool inputs and results into readable text. |
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
| `dme/activities.ts` | Re-exports case/DME store functions as Temporal Activities, including `createHumanTask()`, chat persistence (`persistChatExchange`), and reservation cleanup (`releaseChatReservation`). |
| `dme/workflow.ts` | Defines the one long-running case workflow. `runCoordination()` records a durable round and each streamed tool event before saving the final summary. `runChat()` streams chat text and tool events, persists the exchange, and publishes completion or error. `dmeCaseWorkflow()` handles buffered signals and durable next-day follow-up timers. |

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
3. **Answer a mock call:** `MockCallForm` on `/cases/[id]/external` → `POST /dme/respond` → `recordMockResponse()` → `case-updated` signal → the same workflow resumes. The first three no-response outcomes schedule next-day follow-ups; the fourth creates an advocate task. A reported blocker creates a task immediately.
4. **Fulfill:** selected supplier → mock offer → recorded documents and patient details → explicit patient agreement → pending supplier booking → confirmed reference → simulated patient notification → supplier proof and patient confirmation → `completed`. `getFulfillmentStage()` derives each stage from saved evidence, and the business operations reject premature tool calls.
5. **Resolve a blocker:** `HumanTasksPanel` → `POST /human-tasks/:taskId` → `resolveHumanTask()` → `case-updated` signal → the same workflow reloads the resolution and continues useful work.
6. **Chat:** `CaseChatPanel` → `POST /chat` → `claimCaseChat()` → `chat-requested` signal → workflow `runChat()` → `runChatAgent()` → Workflow Streams → `createCaseChatResponse()` → browser. `completeCaseChat()` saves the final exchange to the same case JSON.
7. **Reset:** `ResetCaseButton` → `POST /reset` → `resetCase()` reads the latest intake, replaces the JSON with the same case ID and a new generation, and cancels the previous workflow when possible.

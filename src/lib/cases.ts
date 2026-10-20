import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";
import { chatActivitySchema, type ChatActivity } from "./chat-activity";
import { patientDetailsSchema } from "./patient-details";
import { getFulfillmentStage, hasValidSupplierOffer, hasValidSupplierDeliveryEvidence, hasValidPatientDeliveryConfirmation } from "./dme/fulfillment";
export { patientDetailsSchema } from "./patient-details";

const intakeSchema = z.object({
  patient: z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
    insurance: z.string().min(1),
    hasSupplement: z.boolean(),
  }),
  equipment: z.object({
    name: z.string().min(1),
    hcpcs: z.string().min(1),
  }),
  pcp: z.object({
    name: z.string().min(1),
    practice: z.string().min(1),
    location: z.string().min(1),
    phone: z.string().min(1),
    notes: z.string().min(1),
  }),
  suppliersContacted: z.number().int().nonnegative(),
});

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
  turnId: z.string().optional(),
  activities: z.array(chatActivitySchema).optional(),
  // Kept only so older locally saved chat messages still load.
  workflowId: z.string().optional(),
});

const activeChatSchema = z.object({
  turnId: z.string(),
  userMessage: z.string(),
  channel: z.enum(["advocate", "patient"]).default("advocate"),
  startedAt: z.string().datetime(),
});

const callSchema = z.object({
  id: z.string(),
  kind: z.enum(["pcp", "supplier", "patient"]),
  purpose: z.enum(["outreach", "supplier_offer", "patient_arrangement", "supplier_booking", "supplier_delivery", "patient_delivery"]).default("outreach"),
  targetId: z.string(),
  targetName: z.string(),
  reason: z.string(),
  questions: z.array(z.string()),
  patientMessage: z.string().trim().min(1).optional(),
  questionFields: z.array(z.string()).optional(),
  offerCallId: z.string().optional(),
  supplierCallsAtStart: z.array(z.string()).default([]),
  status: z.enum(["awaiting_response", "scheduled", "completed", "escalated"]),
  attempt: z.number().int().positive(),
  attemptHistory: z.array(z.object({
    attempt: z.number().int().positive(),
    outcome: z.enum(["answered", "negative", "no_response", "blocked"]),
    recordedAt: z.string().datetime(),
    detail: z.string().optional(),
  })).default([]),
  scheduledFor: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  response: z.object({
    answeredAt: z.string().datetime(),
    answers: z.array(z.string()),
    sourceTurnId: z.string().optional(),
    acceptsNewMedicare: z.boolean().optional(),
    hasK0001: z.boolean().optional(),
    deliveryEstimate: z.string().optional(),
    enrollmentConfirmed: z.boolean().optional(),
    acceptsAssignment: z.boolean().optional(),
    servesArea: z.boolean().optional(),
    issue: z.string().optional(),
    offer: z.object({
      costEstimate: z.string(), rentalTerms: z.string(), deliveryWindows: z.array(z.string()), timeZone: z.string(),
      signedOrderReceived: z.boolean().optional(), clinicalRecordsReceived: z.boolean().optional(), missingDocuments: z.array(z.string()).optional(),
      manufacturer: z.string().optional(), model: z.string().optional(), hcpcs: z.string().optional(),
      arrangement: z.string().optional(), authorizationRequirement: z.string().optional(), advanceNoticeRequirement: z.string().optional(),
      authorizationReady: z.boolean().optional(), advanceNoticeReady: z.boolean().optional(),
      deliveryAddressServed: z.boolean().optional(),
    }).optional(),
    agreement: z.object({ accepted: z.boolean(), addressConfirmed: z.boolean(), selectedSlotId: z.string().optional() }).optional(),
    booking: z.object({ confirmed: z.boolean(), reference: z.string().optional(), instructions: z.string().optional() }).optional(),
    delivery: z.object({ delivered: z.boolean(), proofReference: z.string().optional(), deliveredAt: z.string().optional(), equipmentDelivered: z.string().optional(), receiptStatus: z.string().optional(), patientConfirmed: z.boolean().optional(), usable: z.boolean().optional(), issue: z.string().optional() }).optional(),
  }).nullable(),
});

export const humanTaskSchema = z.object({
  id: z.string(),
  caseId: z.string(),
  type: z.enum(["unanswered_outreach", "clinical_clarification", "missing_information", "provider_issue", "other"]),
  title: z.string(),
  description: z.string(),
  blockerKey: z.string(),
  sourceToolCallId: z.string(),
  callId: z.string().optional(),
  status: z.enum(["pending", "resolved"]),
  resolution: z.string().optional(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
});

const documentSchema = z.object({
  kind: z.enum(["signed_order", "clinical_records"]),
  name: z.string(),
  path: z.string(),
  receivedAt: z.string().datetime(),
});

const deliverySlotSchema = z.object({
  id: z.string(),
  window: z.string().min(1),
  timeZone: z.string().min(1),
});

const fulfillmentSchema = z.object({
  referralReview: z.object({ callId: z.string(), supplierId: z.string(), signedOrderReceived: z.boolean(), clinicalRecordsReceived: z.boolean(), missingDocuments: z.array(z.string()), reviewedAt: z.string().datetime() }).nullable().default(null),
  offer: z.object({
    callId: z.string(), supplierId: z.string(), equipment: z.string(),
    costEstimate: z.string().min(1), rentalTerms: z.string().min(1),
    manufacturer: z.string().optional(), model: z.string().optional(), hcpcs: z.string().optional(),
    arrangement: z.string().optional(), authorizationRequirement: z.string().optional(), advanceNoticeRequirement: z.string().optional(),
    authorizationReady: z.boolean().optional(), advanceNoticeReady: z.boolean().optional(),
    deliveryAddressServed: z.boolean().optional(),
    slots: z.array(deliverySlotSchema).min(1), receivedAt: z.string().datetime(),
  }).nullable().default(null),
  agreement: z.object({
    callId: z.string(), offerCallId: z.string(), status: z.enum(["accepted", "declined"]),
    addressConfirmed: z.boolean(), deliveryAddress: z.string(),
    selectedSlotId: z.string().nullable(), respondedAt: z.string().datetime(),
  }).nullable().default(null),
  booking: z.object({
    callId: z.string(), supplierId: z.string(), slotId: z.string(),
    status: z.enum(["pending", "confirmed", "rejected"]),
    reference: z.string().nullable(), instructions: z.string().optional(), confirmedAt: z.string().datetime().nullable(),
  }).nullable().default(null),
  notification: z.object({
    bookingCallId: z.string(), message: z.string(), sentAt: z.string().datetime(),
  }).nullable().default(null),
  delivery: z.object({
    supplierEvidence: z.object({ callId: z.string(), proofReference: z.string(), deliveredAt: z.string().datetime(), equipmentDelivered: z.string().optional(), receiptStatus: z.string().optional() }).nullable().default(null),
    patientConfirmation: z.object({ callId: z.string(), confirmedAt: z.string().datetime(), usable: z.boolean().optional() }).nullable().default(null),
  }).default({ supplierEvidence: null, patientConfirmation: null }),
}).default({ referralReview: null, offer: null, agreement: null, booking: null, notification: null, delivery: { supplierEvidence: null, patientConfirmation: null } });

const coordinationSchema = z.object({
  workflowId: z.string().nullable().default(null),
  state: z.enum(["not_started", "running", "waiting", "ready", "blocked", "completed", "error"]).default("not_started"),
  calls: z.array(callSchema).default([]),
  documents: z.array(documentSchema).default([]),
  patientDetails: patientDetailsSchema.partial().nullable().default(null),
  selectedSupplierId: z.string().nullable().default(null),
  summary: z.string().nullable().default(null),
}).default({ workflowId: null, state: "not_started", calls: [], documents: [], patientDetails: null, selectedSupplierId: null, summary: null });

const caseStatusSchema = z.enum([
  "Created", "Agent working", "Coordinating", "Awaiting responses", "Follow-up scheduled",
  "Awaiting supplier offer", "Awaiting patient approval", "Awaiting booking confirmation",
  "Booking confirmed", "Awaiting delivery confirmation", "Needs advocate", "Blocked",
  "Delivery verification needed", "Completed", "Agent error",
]);

const checkpointSchema = z.object({
  id: z.string(),
  status: caseStatusSchema,
  createdAt: z.string().datetime(),
  afterMessageCount: z.number().int().nonnegative(),
});

export const autoMockBehaviorSchema = z.enum(["positive", "negative", "no_response"]);
const autoMockAttemptsSchema = z.union([
  autoMockBehaviorSchema,
  z.tuple([autoMockBehaviorSchema, autoMockBehaviorSchema, autoMockBehaviorSchema]),
]).transform((value) => typeof value === "string" ? [value, value, value] as const : value);
const positiveAttempts = ["positive", "positive", "positive"] as const;
const autoMockFulfillmentSchema = z.object({
  supplier_offer: autoMockAttemptsSchema.default(positiveAttempts),
  patient_arrangement: autoMockAttemptsSchema.default(positiveAttempts),
  supplier_booking: autoMockAttemptsSchema.default(positiveAttempts),
  supplier_delivery: autoMockAttemptsSchema.default(positiveAttempts),
  patient_delivery: autoMockAttemptsSchema.default(positiveAttempts),
});
export const autoMockScenarioSchema = z.object({
  suppliers: z.record(z.string(), autoMockAttemptsSchema),
  pcp: autoMockAttemptsSchema,
  patient: autoMockAttemptsSchema,
  fulfillment: autoMockFulfillmentSchema.default({
    supplier_offer: positiveAttempts,
    patient_arrangement: positiveAttempts,
    supplier_booking: positiveAttempts,
    supplier_delivery: positiveAttempts,
    patient_delivery: positiveAttempts,
  }),
});

const autoMockSchema = z.object({
  enabled: z.boolean(),
  scenario: autoMockScenarioSchema.nullable(),
  error: z.string().nullable(),
}).default({ enabled: false, scenario: null, error: null });

const caseSchema = z.object({
  id: z.string().regex(/^CASE-[A-Z0-9-]+$/),
  status: caseStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  intake: intakeSchema,
  messages: z.array(messageSchema).default([]),
  patientMessages: z.array(messageSchema).default([]),
  checkpoints: z.array(checkpointSchema).default([]),
  humanTasks: z.array(humanTaskSchema).default([]),
  generation: z.string().min(1).default("legacy"),
  demoClockOffsetMs: z.number().int().nonnegative().default(0),
  activeChat: activeChatSchema.nullable().default(null),
  coordination: coordinationSchema,
  fulfillment: fulfillmentSchema,
  autoMock: autoMockSchema,
});

export type Case = z.infer<typeof caseSchema>;
export type Intake = z.infer<typeof intakeSchema>;
export type CaseMessage = z.infer<typeof messageSchema>;
export type CaseCheckpoint = z.infer<typeof checkpointSchema>;
export type ChatChannel = "advocate" | "patient";
export type CaseCall = z.infer<typeof callSchema>;
export type CaseDocument = z.infer<typeof documentSchema>;
export type PatientDetails = z.infer<typeof patientDetailsSchema>;
export type HumanTask = z.infer<typeof humanTaskSchema>;
export type DeliverySlot = z.infer<typeof deliverySlotSchema>;
export type Fulfillment = z.infer<typeof fulfillmentSchema>;
export type AutoMockScenario = z.infer<typeof autoMockScenarioSchema>;

function withRecordedPatientConversation(current: Case): Case {
  const known = new Set(current.patientMessages.map((message) => message.turnId));
  const recorded = current.coordination.calls.filter((call) => call.kind === "patient").flatMap((call) => [
    ...(call.patientMessage ? [{ at: call.createdAt, message: { role: "assistant" as const, content: call.patientMessage, turnId: `patient-request:${call.id}` } }] : []),
    ...(call.response?.answers.length && !call.response.sourceTurnId ? [{ at: call.response.answeredAt, message: { role: "user" as const, content: call.response.answers.join("\n"), turnId: `patient-response:${call.id}` } }] : []),
  ]);
  const notice = current.fulfillment.notification;
  if (notice) recorded.push({ at: notice.sentAt, message: { role: "assistant", content: notice.message, turnId: `notification:${notice.bookingCallId}` } });
  const missing = recorded.filter(({ message }) => message.content && !known.has(message.turnId)).sort((a, b) => a.at.localeCompare(b.at));
  return missing.length ? { ...current, patientMessages: [...missing.map(({ message }) => message), ...current.patientMessages] } : current;
}

function deriveCaseStatus(current: Case): Case["status"] {
  const stage = getFulfillmentStage(current);
  if (stage === "completed") return "Completed";
  if (current.fulfillment.delivery.supplierEvidence && !hasValidSupplierDeliveryEvidence(current)) return "Delivery verification needed";
  if (current.coordination.state === "error") return "Agent error";
  if (current.humanTasks.some((task) => task.status === "pending")) return "Needs advocate";
  if (current.coordination.state === "blocked") return "Blocked";
  if (current.coordination.state === "not_started") return "Created";
  if (current.coordination.state === "running") return "Agent working";

  const openCalls = current.coordination.calls.filter((call) => call.status === "awaiting_response");
  if (openCalls.length === 0 && current.coordination.calls.some((call) => call.status === "scheduled")) {
    return "Follow-up scheduled";
  }
  switch (stage) {
    case "coordination":
      if (openCalls.length) return "Awaiting responses";
      return "Coordinating";
    case "patient_confirmation":
      return hasValidSupplierOffer(current) ? "Awaiting patient approval" : "Awaiting supplier offer";
    case "booking": return "Awaiting booking confirmation";
    case "notification": return "Booking confirmed";
    case "delivery": return (current.fulfillment.delivery.supplierEvidence && !hasValidSupplierDeliveryEvidence(current))
      || (current.fulfillment.delivery.patientConfirmation && !hasValidPatientDeliveryConfirmation(current))
      ? "Delivery verification needed" : "Awaiting delivery confirmation";
  }
}

const dataDir = path.join(process.cwd(), "data");
const casesDir = path.join(dataDir, "cases");

function casePath(id: string): string | null {
  if (!caseSchema.shape.id.safeParse(id).success) return null;
  return path.join(casesDir, `${id}.json`);
}

async function withCaseWrite<T>(id: string, action: () => Promise<T>): Promise<T> {
  const filename = casePath(id);
  if (!filename) throw new Error("Invalid case ID");
  const lockDir = `${filename}.lock`;
  let acquired = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await mkdir(lockDir);
      acquired = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const lock = await stat(lockDir).catch(() => null);
      if (lock && Date.now() - lock.mtimeMs > 30_000) {
        await rmdir(lockDir).catch(() => undefined);
      } else {
        await setTimeout(50);
      }
    }
  }
  if (!acquired) throw new Error(`Timed out waiting to write case ${id}`);

  try {
    return await action();
  } finally {
    await rmdir(lockDir);
  }
}

async function writeCase(current: Case): Promise<void> {
  const filename = casePath(current.id)!;
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    const validated = caseSchema.parse(current);
    await writeFile(temporary, JSON.stringify({ ...validated, status: deriveCaseStatus(validated) }, null, 2) + "\n");
    await rename(temporary, filename);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function readIntake(): Promise<Intake> {
  const raw = await readFile(path.join(dataDir, "intake.json"), "utf8");
  return intakeSchema.parse(JSON.parse(raw));
}

function freshCase(id: string, intake: Intake): Case {
  const now = new Date().toISOString();
  return caseSchema.parse({
    id,
    status: "Created",
    createdAt: now,
    updatedAt: now,
    intake,
    messages: [],
    patientMessages: [],
    checkpoints: [],
    humanTasks: [],
    generation: randomUUID(),
    activeChat: null,
    coordination: coordinationSchema.parse(undefined),
  });
}

export async function createCaseFromIntake(): Promise<Case> {
  const created = freshCase(
    `CASE-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`,
    await readIntake(),
  );
  await mkdir(casesDir, { recursive: true });
  // Exclusive creation prevents an existing case from being overwritten.
  await writeFile(casePath(created.id)!, JSON.stringify(created, null, 2) + "\n", {
    flag: "wx",
  });
  return created;
}

export async function getCase(id: string): Promise<Case | null> {
  const filename = casePath(id);
  if (!filename) return null;
  try {
    const saved = JSON.parse(await readFile(filename, "utf8"));
    if (saved.intake?.patient && !saved.intake.patient.insurance) {
      // Cases created before insurance was copied from intake use that same demo intake.
      const intake = await readIntake();
      if (saved.intake.patient.name === intake.patient.name) {
        saved.intake.patient.insurance = intake.patient.insurance;
        saved.intake.patient.hasSupplement = intake.patient.hasSupplement;
      }
    }
    const current = withRecordedPatientConversation(caseSchema.parse(saved));
    return { ...current, status: deriveCaseStatus(current) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function updateCase<T>(id: string, update: (current: Case) => { next: Case; result: T } | null): Promise<T | null> {
  if (!casePath(id)) return null;
  return withCaseWrite(id, async () => {
    const current = await getCase(id);
    if (!current) return null;
    const change = update(current);
    if (!change) return null;
    const next = caseSchema.parse(change.next);
    // Keep the live header free to say "Agent working" while recording the
    // underlying business milestone reached during an agent round.
    const progressCase = next.coordination.state === "running"
      ? { ...next, coordination: { ...next.coordination, state: "waiting" as const } }
      : next;
    const status = deriveCaseStatus(progressCase);
    const checkpointStatuses = new Set<Case["status"]>([
      "Awaiting responses", "Follow-up scheduled", "Awaiting supplier offer", "Awaiting patient approval",
      "Awaiting booking confirmation", "Booking confirmed", "Awaiting delivery confirmation",
      "Delivery verification needed", "Needs advocate", "Blocked", "Completed", "Agent error",
    ]);
    const lastCheckpoint = next.checkpoints.at(-1);
    if (checkpointStatuses.has(status) && lastCheckpoint?.status !== status) {
      next.checkpoints.push({ id: randomUUID(), status, createdAt: new Date().toISOString(), afterMessageCount: next.messages.length });
    }
    await writeCase(next);
    return change.result;
  });
}

export type ChatClaim =
  | { status: "claimed"; current: Case }
  | { status: "busy" | "not_found" };

export async function claimCaseChat(id: string, turnId: string, userMessage: string, channel: ChatChannel = "advocate"): Promise<ChatClaim> {
  if (!casePath(id)) return { status: "not_found" };
  return withCaseWrite(id, async () => {
    const current = await getCase(id);
    if (!current) return { status: "not_found" };
    if (current.activeChat) return { status: "busy" };

    const updated = caseSchema.parse({
      ...current,
      activeChat: { turnId, userMessage, channel, startedAt: new Date().toISOString() },
      updatedAt: new Date().toISOString(),
    });
    await writeCase(updated);
    return { status: "claimed", current: updated };
  });
}

export async function completeCaseChat(
  id: string,
  generation: string,
  turnId: string,
  answer: string,
  activities: ChatActivity[] = [],
): Promise<"saved" | "already_saved" | "discarded"> {
  return withCaseWrite(id, async () => {
    const current = await getCase(id);
    if (!current || current.generation !== generation) return "discarded";
    if ([...current.messages, ...current.patientMessages].some((message) => message.turnId === turnId || message.workflowId === turnId)) return "already_saved";
    if (current.activeChat?.turnId !== turnId) return "discarded";

    const channel = current.activeChat.channel;
    const exchange: CaseMessage[] = [
      { role: "user", content: current.activeChat.userMessage, turnId },
      { role: "assistant", content: answer, turnId, activities },
    ];
    const updated = caseSchema.parse({
      ...current,
      messages: channel === "advocate" ? [...current.messages, ...exchange] : current.messages,
      patientMessages: channel === "patient" ? [...current.patientMessages, ...exchange] : current.patientMessages,
      coordination: channel === "patient" ? { ...current.coordination, summary: null } : current.coordination,
      activeChat: null,
      updatedAt: new Date().toISOString(),
    });
    await writeCase(updated);
    return "saved";
  });
}

export async function releaseCaseChat(id: string, generation: string, turnId: string): Promise<void> {
  if (!casePath(id)) return;
  await withCaseWrite(id, async () => {
    const current = await getCase(id);
    if (!current || current.generation !== generation || current.activeChat?.turnId !== turnId) return;
    await writeCase(caseSchema.parse({ ...current, activeChat: null, updatedAt: new Date().toISOString() }));
  });
}

export async function resetCase(id: string): Promise<Case | null> {
  if (!casePath(id)) return null;
  const intake = await readIntake();
  return withCaseWrite(id, async () => {
    const current = await getCase(id);
    if (!current) return null;

    const reset = freshCase(id, intake);
    await writeCase(reset);
    return reset;
  });
}

export async function listCases(): Promise<Case[]> {
  await mkdir(casesDir, { recursive: true });
  const filenames = (await readdir(casesDir)).filter((name) => name.endsWith(".json"));
  const cases = await Promise.all(
    filenames.map((name) => getCase(name.slice(0, -5))),
  );
  return cases
    .filter((item): item is Case => item !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

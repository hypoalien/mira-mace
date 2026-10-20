import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";

const intakeSchema = z.object({
  patient: z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
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
  // Kept only so older locally saved chat messages still load.
  workflowId: z.string().optional(),
});

const activeChatSchema = z.object({
  turnId: z.string(),
  userMessage: z.string(),
  startedAt: z.string().datetime(),
});

const callSchema = z.object({
  id: z.string(),
  kind: z.enum(["pcp", "supplier", "patient"]),
  targetId: z.string(),
  targetName: z.string(),
  reason: z.string(),
  questions: z.array(z.string()),
  questionFields: z.array(z.string()).optional(),
  supplierCallsAtStart: z.array(z.string()).default([]),
  status: z.enum(["awaiting_response", "scheduled", "completed"]),
  attempt: z.number().int().positive(),
  scheduledFor: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  response: z.object({
    answeredAt: z.string().datetime(),
    answers: z.array(z.string()),
    acceptsNewMedicare: z.boolean().optional(),
    hasK0001: z.boolean().optional(),
    deliveryEstimate: z.string().optional(),
  }).nullable(),
});

const documentSchema = z.object({
  kind: z.enum(["signed_order", "clinical_records"]),
  name: z.string(),
  path: z.string(),
  receivedAt: z.string().datetime(),
});

export const patientDetailsSchema = z.object({
  address: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  contactDetails: z.string().trim().min(1),
  deliveryAddress: z.string().trim().min(1),
  insuranceDetails: z.string().trim().min(1),
  homeAccessibility: z.string().trim().min(1),
});

const coordinationSchema = z.object({
  workflowId: z.string().nullable().default(null),
  state: z.enum(["not_started", "running", "waiting", "ready", "blocked", "error"]).default("not_started"),
  calls: z.array(callSchema).default([]),
  documents: z.array(documentSchema).default([]),
  patientDetails: patientDetailsSchema.partial().nullable().default(null),
  selectedSupplierId: z.string().nullable().default(null),
  summary: z.string().nullable().default(null),
}).default({ workflowId: null, state: "not_started", calls: [], documents: [], patientDetails: null, selectedSupplierId: null, summary: null });

const caseSchema = z.object({
  id: z.string().regex(/^CASE-[A-Z0-9-]+$/),
  status: z.literal("Created"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  intake: intakeSchema,
  messages: z.array(messageSchema).default([]),
  generation: z.string().min(1).default("legacy"),
  activeChat: activeChatSchema.nullable().default(null),
  coordination: coordinationSchema,
});

export type Case = z.infer<typeof caseSchema>;
export type Intake = z.infer<typeof intakeSchema>;
export type CaseMessage = z.infer<typeof messageSchema>;
export type CaseCall = z.infer<typeof callSchema>;
export type CaseDocument = z.infer<typeof documentSchema>;
export type PatientDetails = z.infer<typeof patientDetailsSchema>;

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
    await writeFile(temporary, JSON.stringify(caseSchema.parse(current), null, 2) + "\n");
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
    return caseSchema.parse(JSON.parse(await readFile(filename, "utf8")));
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
    await writeCase(caseSchema.parse(change.next));
    return change.result;
  });
}

export type ChatClaim =
  | { status: "claimed"; current: Case }
  | { status: "busy" | "not_found" };

export async function claimCaseChat(id: string, turnId: string, userMessage: string): Promise<ChatClaim> {
  if (!casePath(id)) return { status: "not_found" };
  return withCaseWrite(id, async () => {
    const current = await getCase(id);
    if (!current) return { status: "not_found" };
    if (current.activeChat) return { status: "busy" };

    const updated = caseSchema.parse({
      ...current,
      activeChat: { turnId, userMessage, startedAt: new Date().toISOString() },
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
): Promise<"saved" | "already_saved" | "discarded"> {
  return withCaseWrite(id, async () => {
    const current = await getCase(id);
    if (!current || current.generation !== generation) return "discarded";
    if (current.messages.some((message) => message.turnId === turnId || message.workflowId === turnId)) return "already_saved";
    if (current.activeChat?.turnId !== turnId) return "discarded";

    const updated = caseSchema.parse({
      ...current,
      messages: [
        ...current.messages,
        { role: "user", content: current.activeChat.userMessage, turnId },
        { role: "assistant", content: answer, turnId },
      ],
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

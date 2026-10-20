import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const intakeSchema = z.object({
  patient: z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
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

const caseSchema = z.object({
  id: z.string().regex(/^CASE-[A-Z0-9-]+$/),
  status: z.literal("Created"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  intake: intakeSchema,
});

export type Case = z.infer<typeof caseSchema>;
export type Intake = z.infer<typeof intakeSchema>;

const dataDir = path.join(process.cwd(), "data");
const casesDir = path.join(dataDir, "cases");

function casePath(id: string): string | null {
  if (!caseSchema.shape.id.safeParse(id).success) return null;
  return path.join(casesDir, `${id}.json`);
}

export async function readIntake(): Promise<Intake> {
  const raw = await readFile(path.join(dataDir, "intake.json"), "utf8");
  return intakeSchema.parse(JSON.parse(raw));
}

export async function createCaseFromIntake(): Promise<Case> {
  const intake = await readIntake();
  const now = new Date().toISOString();
  const created = caseSchema.parse({
    id: `CASE-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`,
    status: "Created",
    createdAt: now,
    updatedAt: now,
    intake,
  });
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

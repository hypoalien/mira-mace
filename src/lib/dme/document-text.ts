import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { Case, CaseDocument } from "../cases";
import { DEMO_DOCUMENTS } from "../dme-constants";

const execFileAsync = promisify(execFile);

export async function readReceivedDocuments(documents: CaseDocument[]) {
  return Promise.all(documents.map(async (document) => {
    const known = DEMO_DOCUMENTS.find((file) => file.kind === document.kind && file.path === document.path);
    if (!known) throw new Error(`Unknown case document: ${document.path}`);

    const filename = path.join(process.cwd(), "public", known.path.slice(1));
    const { stdout } = await execFileAsync("pdftotext", ["-enc", "UTF-8", "-nopgbrk", filename, "-"], {
      maxBuffer: 5 * 1024 * 1024,
      timeout: 15_000,
    });
    const text = stdout.trim();
    if (!text) throw new Error(`No extractable text in ${document.path}`);
    return { kind: document.kind, name: document.name, text };
  }));
}

export async function validateDemoDocuments(current: Case, kinds: Array<CaseDocument["kind"]>) {
  const clinician = current.intake.pcp.name.replace(/^Dr\.\s*/i, "");
  const documents = await readReceivedDocuments(DEMO_DOCUMENTS.filter((document) => kinds.includes(document.kind))
    .map((document) => ({ ...document, receivedAt: new Date().toISOString() })));
  for (const document of documents) {
    const text = document.text;
    if (!text.includes(current.intake.patient.name)) throw new Error(`${document.name} names a different patient`);
    if (document.kind === "signed_order" && (
      !text.includes(current.intake.equipment.hcpcs) || !text.includes(clinician)
      || !/order date\s+\w+\s+\d{1,2},\s+\d{4}/i.test(text)
      || !/electronically signed by/i.test(text)
    )) throw new Error("The signed order is missing patient, equipment, date, clinician, or signature evidence");
    if (document.kind === "clinical_records" && (
      !/home|in-home/i.test(text) || !/cane/i.test(text) || !/walker/i.test(text)
      || !/wheelchair/i.test(text) || !/caregiver|self-propel|propulsion/i.test(text)
    )) throw new Error("Clinical records do not cover home mobility, cane/walker limits, and wheelchair use");
  }
}

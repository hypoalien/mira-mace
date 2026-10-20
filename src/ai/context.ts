import type { DmeAction, loadDmeContext } from "../lib/dme/cases";
import { DME_AGENT_INSTRUCTIONS } from "./prompts";

export type LoadDmeContext = typeof loadDmeContext;

export async function prepareAgentStep(action: DmeAction, loadContext: LoadDmeContext) {
  const context = await loadContext(action);
  if (!context) return { activeTools: [] as Array<"contactPCP" | "contactSupplier" | "contactPatient"> };

  const { current, suppliers, missingPatientFields } = context;
  const calls = current.coordination.calls;
  const supplierCalls = calls.filter((call) => call.kind === "supplier");
  const supplierOpen = supplierCalls.some((call) => call.status === "awaiting_response");
  const availableSupplier = suppliers.some((supplier) => supplier.medicareEnrolled && !supplierCalls.some((call) => call.targetId === supplier.id));
  const pcpOpen = calls.some((call) => call.kind === "pcp" && call.status !== "completed");
  const patientOpen = calls.some((call) => call.kind === "patient" && call.status !== "completed");
  const missingDocuments = current.coordination.documents.length < 2;
  const activeTools: Array<"contactPCP" | "contactSupplier" | "contactPatient"> = [];
  if (!current.coordination.selectedSupplierId && !supplierOpen && availableSupplier) activeTools.push("contactSupplier");
  if (missingDocuments && !pcpOpen) activeTools.push("contactPCP");
  if (missingPatientFields.length > 0 && !patientOpen) activeTools.push("contactPatient");

  return {
    activeTools,
    system: `${DME_AGENT_INSTRUCTIONS}\n\nCurrent authoritative case context:\n${JSON.stringify({
      intake: current.intake,
      requiredDocuments: ["signed_order", "clinical_records"],
      receivedDocuments: current.coordination.documents,
      supplierDirectory: suppliers,
      supplierCalls,
      pcpCalls: calls.filter((call) => call.kind === "pcp"),
      patientCalls: calls.filter((call) => call.kind === "patient"),
      patientDetails: current.coordination.patientDetails,
      missingPatientFields,
      selectedSupplierId: current.coordination.selectedSupplierId,
    })}`,
  };
}

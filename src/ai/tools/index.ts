import type { DmeAction } from "../../lib/dme/cases";
import type { contactPatient } from "../../lib/dme/contact-patient";
import type { contactPCP } from "../../lib/dme/contact-pcp";
import type { contactSupplier } from "../../lib/dme/contact-supplier";
import { createContactPatientTool } from "./contact-patient";
import { createContactPCPTool } from "./contact-pcp";
import { createContactSupplierTool } from "./contact-supplier";

export type ContactActivities = {
  contactPatient: typeof contactPatient;
  contactPCP: typeof contactPCP;
  contactSupplier: typeof contactSupplier;
};

export function createCoordinationTools(
  action: DmeAction,
  activities: ContactActivities,
) {
  return {
    contactPatient: createContactPatientTool(action, activities.contactPatient),
    contactPCP: createContactPCPTool(action, activities.contactPCP),
    contactSupplier: createContactSupplierTool(
      action,
      activities.contactSupplier,
    ),
  };
}

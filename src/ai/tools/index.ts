import type { DmeAction } from "../../lib/dme/cases";
import type { contactPatient } from "../../lib/dme/contact-patient";
import type { contactPCP } from "../../lib/dme/contact-pcp";
import type { contactSupplier } from "../../lib/dme/contact-supplier";
import type { createHumanTask } from "../../lib/dme/human-tasks";
import type { requestSupplierOffer } from "../../lib/dme/supplier-offer";
import type { confirmPatientArrangement } from "../../lib/dme/patient-arrangement";
import type { bookDelivery } from "../../lib/dme/book-delivery";
import type { notifyPatient } from "../../lib/dme/notify-patient";
import type { requestPatientDeliveryConfirmation, requestSupplierDeliveryEvidence } from "../../lib/dme/verify-delivery";
import { createContactPatientTool } from "./contact-patient";
import { createContactPCPTool } from "./contact-pcp";
import { createContactSupplierTool } from "./contact-supplier";
import { createHumanAssistanceTool } from "./request-human-assistance";
import { createRequestSupplierOfferTool } from "./request-supplier-offer";
import { createConfirmPatientArrangementTool } from "./confirm-patient-arrangement";
import { createBookDeliveryTool } from "./book-delivery";
import { createNotifyPatientTool } from "./notify-patient";
import { createPatientDeliveryConfirmationTool, createSupplierDeliveryEvidenceTool } from "./verify-delivery";

export type ContactActivities = {
  contactPatient: typeof contactPatient;
  contactPCP: typeof contactPCP;
  contactSupplier: typeof contactSupplier;
  createHumanTask: typeof createHumanTask;
  requestSupplierOffer: typeof requestSupplierOffer;
  confirmPatientArrangement: typeof confirmPatientArrangement;
  bookDelivery: typeof bookDelivery;
  notifyPatient: typeof notifyPatient;
  requestSupplierDeliveryEvidence: typeof requestSupplierDeliveryEvidence;
  requestPatientDeliveryConfirmation: typeof requestPatientDeliveryConfirmation;
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
    requestHumanAssistance: createHumanAssistanceTool(action, activities.createHumanTask),
    requestSupplierOffer: createRequestSupplierOfferTool(action, activities.requestSupplierOffer),
    confirmPatientArrangement: createConfirmPatientArrangementTool(action, activities.confirmPatientArrangement),
    bookDelivery: createBookDeliveryTool(action, activities.bookDelivery),
    notifyPatient: createNotifyPatientTool(action, activities.notifyPatient),
    requestSupplierDeliveryEvidence: createSupplierDeliveryEvidenceTool(action, activities.requestSupplierDeliveryEvidence),
    requestPatientDeliveryConfirmation: createPatientDeliveryConfirmationTool(action, activities.requestPatientDeliveryConfirmation),
  };
}

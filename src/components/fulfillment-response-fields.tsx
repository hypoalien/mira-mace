"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Case, CaseCall } from "@/lib/cases";

export type FulfillmentDraft = {
  costEstimate?: string; rentalTerms?: string; deliveryWindows?: string[]; timeZone?: string;
  signedOrderReceived?: boolean; clinicalRecordsReceived?: boolean; missingDocuments?: string[]; deliveryAddressServed?: boolean;
  manufacturer?: string; model?: string; hcpcs?: string; arrangement?: string;
  authorizationRequirement?: string; advanceNoticeRequirement?: string; authorizationReady?: boolean; advanceNoticeReady?: boolean;
  agreementAccepted?: boolean; addressConfirmed?: boolean; selectedSlotId?: string;
  bookingConfirmed?: boolean; bookingReference?: string; bookingInstructions?: string;
  delivered?: boolean; proofReference?: string; deliveredAt?: string; equipmentDelivered?: string; receiptStatus?: string;
  patientConfirmed?: boolean; usable?: boolean; issue?: string;
};

export function FulfillmentResponseFields({ current, call, draft, onChange }: {
  current: Case; call: CaseCall; draft: FulfillmentDraft;
  onChange: (change: Partial<FulfillmentDraft>) => void;
}) {
  const choice = (label: string, value: boolean | undefined, field: keyof FulfillmentDraft) => (
    <div className="space-y-1.5">
      <Label htmlFor={`field-${field}`}>{label}</Label>
      <Select value={value === undefined ? undefined : value ? "yes" : "no"} onValueChange={(next) => onChange({ [field]: next === "yes" })}>
        <SelectTrigger id={`field-${field}`} className="w-full"><SelectValue placeholder="Select answer" /></SelectTrigger>
        <SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 text-xs text-muted-foreground">
        {call.questions.map((question) => <p key={question}>{question}</p>)}
      </div>
      {call.purpose === "supplier_offer" && <>
        {choice("Signed order received and usable", draft.signedOrderReceived, "signedOrderReceived")}
        {choice("Clinical records received and usable", draft.clinicalRecordsReceived, "clinicalRecordsReceived")}
        <div className="space-y-1.5"><Label htmlFor="missing-documents">Missing or unusable documents, one per line</Label><Textarea id="missing-documents" value={(draft.missingDocuments ?? []).join("\n")} onChange={(event) => onChange({ missingDocuments: event.target.value.split("\n").filter(Boolean) })} rows={2} /></div>
        {choice(`Supplier serves ${current.coordination.patientDetails?.deliveryAddress}`, draft.deliveryAddressServed, "deliveryAddressServed")}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="manufacturer">Manufacturer</Label><Input id="manufacturer" value={draft.manufacturer ?? ""} onChange={(event) => onChange({ manufacturer: event.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="model">Model</Label><Input id="model" value={draft.model ?? ""} onChange={(event) => onChange({ model: event.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="hcpcs">Planned HCPCS</Label><Input id="hcpcs" value={draft.hcpcs ?? ""} onChange={(event) => onChange({ hcpcs: event.target.value })} placeholder={current.intake.equipment.hcpcs} /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="arrangement">Rental or purchase arrangement</Label><Input id="arrangement" value={draft.arrangement ?? ""} onChange={(event) => onChange({ arrangement: event.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="cost-estimate">Estimated patient cost</Label><Input id="cost-estimate" value={draft.costEstimate ?? ""} onChange={(event) => onChange({ costEstimate: event.target.value })} placeholder="$20 per month" /></div>
        <div className="space-y-1.5"><Label htmlFor="rental-terms">Rental terms</Label><Textarea id="rental-terms" value={draft.rentalTerms ?? ""} onChange={(event) => onChange({ rentalTerms: event.target.value })} rows={2} /></div>
        <div className="space-y-1.5"><Label htmlFor="authorization-requirement">Authorization requirement, or none</Label><Input id="authorization-requirement" value={draft.authorizationRequirement ?? ""} onChange={(event) => onChange({ authorizationRequirement: event.target.value })} /></div>
        {choice("Authorization requirement resolved or not required", draft.authorizationReady, "authorizationReady")}
        <div className="space-y-1.5"><Label htmlFor="advance-notice-requirement">Advance notice requirement, or none</Label><Input id="advance-notice-requirement" value={draft.advanceNoticeRequirement ?? ""} onChange={(event) => onChange({ advanceNoticeRequirement: event.target.value })} /></div>
        {choice("Advance notice requirement resolved or not required", draft.advanceNoticeReady, "advanceNoticeReady")}
        <div className="space-y-1.5"><Label htmlFor="delivery-windows">Available delivery windows, one per line</Label><Textarea id="delivery-windows" value={(draft.deliveryWindows ?? []).join("\n")} onChange={(event) => onChange({ deliveryWindows: event.target.value.split("\n") })} rows={3} placeholder="2026-10-23 09:00-12:00" /><p className="text-xs text-muted-foreground">Use YYYY-MM-DD HH:mm-HH:mm in the selected time zone.</p></div>
        <div className="space-y-1.5"><Label htmlFor="offer-time-zone">Time zone</Label><Input id="offer-time-zone" value={draft.timeZone ?? "America/Chicago"} onChange={(event) => onChange({ timeZone: event.target.value })} /></div>
      </>}
      {call.purpose === "patient_arrangement" && <>
        <p className="text-xs">Estimated cost: {current.fulfillment.offer?.costEstimate}. Rental terms: {current.fulfillment.offer?.rentalTerms}.</p>
        {choice("Patient accepts cost and rental terms", draft.agreementAccepted, "agreementAccepted")}
        {choice(`Patient confirms delivery address: ${current.coordination.patientDetails?.deliveryAddress}`, draft.addressConfirmed, "addressConfirmed")}
        <div className="space-y-1.5"><Label htmlFor="preferred-slot">Preferred offered window</Label><Select value={draft.selectedSlotId} onValueChange={(value) => onChange({ selectedSlotId: value })}><SelectTrigger id="preferred-slot" className="w-full"><SelectValue placeholder="Select a window" /></SelectTrigger><SelectContent>{current.fulfillment.offer?.slots.map((slot) => <SelectItem key={slot.id} value={slot.id}>{slot.window} ({slot.timeZone})</SelectItem>)}</SelectContent></Select></div>
      </>}
      {call.purpose === "supplier_booking" && <>
        {choice("Supplier confirms the agreed booking", draft.bookingConfirmed, "bookingConfirmed")}
        {draft.bookingConfirmed && <div className="space-y-1.5"><Label htmlFor="booking-reference">Supplier booking reference</Label><Input id="booking-reference" value={draft.bookingReference ?? ""} onChange={(event) => onChange({ bookingReference: event.target.value })} /></div>}
        {draft.bookingConfirmed && <div className="space-y-1.5"><Label htmlFor="booking-instructions">Delivery instructions</Label><Textarea id="booking-instructions" value={draft.bookingInstructions ?? ""} onChange={(event) => onChange({ bookingInstructions: event.target.value })} rows={2} /></div>}
      </>}
      {call.purpose === "supplier_delivery" && <>
        {choice("Supplier confirms delivery", draft.delivered, "delivered")}
        {draft.delivered && <>
          <div className="space-y-1.5"><Label htmlFor="proof-reference">Proof reference</Label><Input id="proof-reference" value={draft.proofReference ?? ""} onChange={(event) => onChange({ proofReference: event.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="equipment-delivered">Equipment actually delivered (manufacturer and model)</Label><Input id="equipment-delivered" value={draft.equipmentDelivered ?? ""} onChange={(event) => onChange({ equipmentDelivered: event.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="receipt-status">Receipt or signature status</Label><Select value={draft.receiptStatus} onValueChange={(value) => onChange({ receiptStatus: value })}><SelectTrigger id="receipt-status" className="w-full"><SelectValue placeholder="Select evidence" /></SelectTrigger><SelectContent><SelectItem value="signed_by_patient">Signed by patient</SelectItem><SelectItem value="signed_by_caregiver">Signed by caregiver</SelectItem><SelectItem value="carrier_tracking">Carrier tracking recorded</SelectItem></SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="delivered-at">Delivery time with time zone (ISO 8601)</Label><Input id="delivered-at" value={draft.deliveredAt ?? ""} onChange={(event) => onChange({ deliveredAt: event.target.value })} placeholder="2026-10-23T11:00:00-05:00" /></div>
        </>}
      </>}
      {call.purpose === "patient_delivery" && <>
        {choice("Patient received the correct equipment without issue", draft.patientConfirmed, "patientConfirmed")}
        {choice("Patient can use the wheelchair", draft.usable, "usable")}
        {draft.patientConfirmed === false && <div className="space-y-1.5"><Label htmlFor="patient-delivery-issue">What went wrong?</Label><Textarea id="patient-delivery-issue" value={draft.issue ?? ""} onChange={(event) => onChange({ issue: event.target.value })} rows={2} /></div>}
      </>}
    </div>
  );
}

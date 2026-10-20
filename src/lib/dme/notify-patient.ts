import { updateCase } from "../cases";
import { hasConfirmedBooking, hasCoordinationReadiness } from "./fulfillment";
import { matches, type DmeAction } from "./cases";
import { caseNowIso } from "./demo-clock";

export async function notifyPatient(input: DmeAction & { toolCallId: string; patientMessage: string }) {
  return updateCase<{ status: string; message?: string }>(input.caseId, (current) => {
    if (!matches(current, input)) return null;
    if (!hasCoordinationReadiness(current) || !hasConfirmedBooking(current)) return { next: current, result: { status: "booking_not_confirmed" } };
    const booking = current.fulfillment.booking!;
    if (current.fulfillment.notification?.bookingCallId === booking.callId) return { next: current, result: { status: "already_notified" } };
    const message = input.patientMessage.trim();
    if (!message) throw new Error("A patient-facing booking notice is required");
    const notification = { bookingCallId: booking.callId, message, sentAt: caseNowIso(current) };
    return { next: {
      ...current,
      updatedAt: notification.sentAt,
      patientMessages: [...current.patientMessages, { role: "assistant", content: message, turnId: `notification:${booking.callId}` }],
      fulfillment: { ...current.fulfillment, notification },
    }, result: { status: "notified", message } };
  });
}

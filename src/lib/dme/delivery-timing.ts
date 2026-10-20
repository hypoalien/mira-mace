import type { Case, DeliverySlot } from "../cases";

export function deliveryWindowTimes(slot: DeliverySlot) {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(slot.window);
  if (!match) throw new Error("The booked delivery window is invalid");
  const [, date, startTime, endTime] = match;
  const noon = new Date(`${date}T12:00:00Z`);
  const zone = new Intl.DateTimeFormat("en-US", { timeZone: slot.timeZone, timeZoneName: "shortOffset" })
    .formatToParts(noon).find((part) => part.type === "timeZoneName")?.value;
  const offset = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(zone ?? "");
  if (!offset) throw new Error(`Cannot read the booked delivery time zone: ${slot.timeZone}`);
  const suffix = `${offset[1]}${offset[2].padStart(2, "0")}:${offset[3] ?? "00"}`;
  return {
    start: new Date(`${date}T${startTime}:00${suffix}`).getTime(),
    end: new Date(`${date}T${endTime}:00${suffix}`).getTime(),
  };
}

export function bookedDeliveryWindow(current: Case) {
  return current.fulfillment.offer?.slots.find((slot) => slot.id === current.fulfillment.agreement?.selectedSlotId) ?? null;
}

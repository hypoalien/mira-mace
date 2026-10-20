import { updateCase } from "../cases";
import { caseNowMs } from "./demo-clock";
import { deliveryWindowTimes } from "./delivery-timing";
import { upcomingBookedDeliveryWindow } from "./fulfillment";

export async function travelToBookedDeliveryWindow(caseId: string) {
  return updateCase(caseId, (current) => {
    const slot = upcomingBookedDeliveryWindow(current);
    if (!slot) return null;
    const { start, end } = deliveryWindowTimes(slot);
    const realNow = Date.now();
    const target = Math.min(start + 60_000, Math.floor((start + end) / 2));
    if (target <= caseNowMs(current, realNow)) return null;
    return {
      next: { ...current, demoClockOffsetMs: target - realNow, updatedAt: new Date(target).toISOString() },
      result: { workflowId: current.coordination.workflowId, demoNow: new Date(target).toISOString() },
    };
  });
}

import assert from "node:assert/strict";
import { unlink } from "node:fs/promises";
import { test } from "node:test";
import path from "node:path";
import { autoMockScenarioSchema, createCaseFromIntake, getCase, updateCase, type CaseCall } from "../cases";
import { behaviorFor, processAutoMockResponses } from "./auto-mock";
import { runScheduledFollowUpNow } from "./cases";
import { caseNowMs } from "./demo-clock";

test("each mock request uses its own scenario and attempt sequence", () => {
  const scenario = autoMockScenarioSchema.parse({
    suppliers: { "SUP-001": ["no_response", "negative", "positive"] },
    pcp: ["negative", "no_response", "positive"],
    patient: ["no_response", "no_response", "no_response"],
    fulfillment: {
      supplier_offer: ["positive", "negative", "no_response"],
      patient_arrangement: ["positive", "no_response", "negative"],
      supplier_booking: ["negative", "positive", "no_response"],
      supplier_delivery: ["no_response", "positive", "negative"],
      patient_delivery: ["negative", "no_response", "positive"],
    },
  });
  const requests = [
    ["supplier", "outreach", scenario.suppliers["SUP-001"]],
    ["pcp", "outreach", scenario.pcp],
    ["patient", "outreach", scenario.patient],
    ["supplier", "supplier_offer", scenario.fulfillment.supplier_offer],
    ["patient", "patient_arrangement", scenario.fulfillment.patient_arrangement],
    ["supplier", "supplier_booking", scenario.fulfillment.supplier_booking],
    ["supplier", "supplier_delivery", scenario.fulfillment.supplier_delivery],
    ["patient", "patient_delivery", scenario.fulfillment.patient_delivery],
  ] as const;

  for (const [kind, purpose, expected] of requests) {
    for (const attempt of [1, 2, 3]) {
      const call = { kind, purpose, targetId: "SUP-001", attempt } as CaseCall;
      assert.equal(behaviorFor(call, scenario), expected[attempt - 1], `${purpose} attempt ${attempt}`);
    }
  }
});

test("older scenarios only use no-response choices for initial outreach", () => {
  const scenario = autoMockScenarioSchema.parse({
    suppliers: { "SUP-001": ["no_response", "no_response", "no_response"] },
    pcp: ["no_response", "no_response", "no_response"],
    patient: ["no_response", "no_response", "no_response"],
  });
  assert.equal(behaviorFor({ kind: "patient", purpose: "outreach", attempt: 1 } as CaseCall, scenario), "no_response");
  assert.equal(behaviorFor({ kind: "patient", purpose: "patient_arrangement", attempt: 1 } as CaseCall, scenario), "positive");
  assert.equal(behaviorFor({ kind: "patient", purpose: "patient_delivery", attempt: 1 } as CaseCall, scenario), "positive");
  assert.equal(behaviorFor({ kind: "supplier", purpose: "supplier_offer", attempt: 1 } as CaseCall, scenario), "positive");
});

test("a fulfillment request retries its own three no-answer attempts", async () => {
  const created = await createCaseFromIntake();
  const filename = path.join(process.cwd(), "data", "cases", `${created.id}.json`);
  const workflowId = `test-${created.id}`;
  const callId = `${workflowId}:arrangement`;
  const action = { caseId: created.id, generation: created.generation, workflowId };
  try {
    const scenario = autoMockScenarioSchema.parse({
      suppliers: {}, pcp: ["positive", "positive", "positive"], patient: ["positive", "positive", "positive"],
      fulfillment: { patient_arrangement: ["no_response", "no_response", "no_response"] },
    });
    await updateCase(created.id, (current) => ({
      next: {
        ...current,
        autoMock: { enabled: true, scenario, error: null },
        coordination: {
          ...current.coordination, workflowId, state: "waiting",
          calls: [{
            id: callId, kind: "patient", purpose: "patient_arrangement", targetId: "PATIENT", targetName: current.intake.patient.name,
            reason: "Confirm rental terms", questions: ["Accept terms?"], supplierCallsAtStart: [],
            status: "awaiting_response", attempt: 1, attemptHistory: [], scheduledFor: null,
            createdAt: new Date().toISOString(), response: null,
          }],
        },
      },
      result: true,
    }));

    for (const attempt of [1, 2, 3]) {
      assert.equal(await processAutoMockResponses(action), 1);
      const current = await getCase(created.id);
      assert(current);
      const call = current.coordination.calls[0];
      assert.equal(call.attempt, attempt);
      assert.equal(call.status, attempt === 3 ? "escalated" : "scheduled");
      if (attempt < 3) assert(await runScheduledFollowUpNow(created.id, callId));
    }
    const finished = await getCase(created.id);
    assert.equal(finished?.humanTasks.filter((task) => task.status === "pending").length, 1);
  } finally {
    await unlink(filename).catch(() => undefined);
  }
});

test("traveling to a follow-up advances case time and releases all calls due then", async () => {
  const created = await createCaseFromIntake();
  const filename = path.join(process.cwd(), "data", "cases", `${created.id}.json`);
  const firstAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const secondAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  try {
    await updateCase(created.id, (current) => ({
      next: {
        ...current,
        coordination: {
          ...current.coordination,
          workflowId: `test-${created.id}`,
          calls: [firstAt, secondAt].map((scheduledFor, index) => ({
            id: `follow-up-${index}`, kind: "patient" as const, purpose: "outreach" as const,
            targetId: "PATIENT", targetName: current.intake.patient.name,
            reason: "Retry contact", questions: ["Can we speak now?"], supplierCallsAtStart: [],
            status: "scheduled" as const, attempt: 1, attemptHistory: [], scheduledFor,
            createdAt: current.createdAt, response: null,
          })),
        },
      },
      result: true,
    }));

    const advanced = await runScheduledFollowUpNow(created.id, "follow-up-1");
    assert.equal(advanced?.advancedCallCount, 2);
    const current = await getCase(created.id);
    assert(current);
    assert(caseNowMs(current) >= Date.parse(secondAt));
    assert(current.coordination.calls.every((call) => call.status === "awaiting_response" && call.attempt === 2));
  } finally {
    await unlink(filename).catch(() => undefined);
  }
});

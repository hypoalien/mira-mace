import { generateText, stepCountIs, type LanguageModel } from "ai";
import type { DmeAction } from "../../lib/dme/cases";
import { prepareAgentStep, type LoadDmeContext } from "../context";
import { DME_AGENT_INSTRUCTIONS } from "../prompts";
import { createCoordinationTools, type ContactActivities } from "../tools";

type DmeAgentActivities = ContactActivities & {
  loadDmeContext: LoadDmeContext;
};

export async function runDmeAgent(
  model: LanguageModel,
  action: DmeAction,
  activities: DmeAgentActivities,
) {
  return generateText({
    model,
    system: DME_AGENT_INSTRUCTIONS,
    prompt:
      "Review the current case and take useful coordination actions now. Summarize your work briefly.",
    tools: createCoordinationTools(action, activities),
    prepareStep: () => prepareAgentStep(action, activities.loadDmeContext),
    stopWhen: stepCountIs(6),
  });
}

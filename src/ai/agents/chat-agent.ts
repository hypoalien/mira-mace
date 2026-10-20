import { stepCountIs, streamText, type LanguageModel } from "ai";
import type { CaseMessage } from "../../lib/cases";
import type { DmeAction } from "../../lib/dme/cases";
import { prepareAgentStep, type LoadDmeContext } from "../context";
import { DME_AGENT_INSTRUCTIONS } from "../prompts";
import { createCoordinationTools, type ContactActivities } from "../tools";

type ChatAgentActivities = ContactActivities & { loadDmeContext: LoadDmeContext };

export async function runChatAgent(
  model: LanguageModel,
  action: DmeAction,
  messages: CaseMessage[],
  userMessage: string,
  activities: ChatAgentActivities,
): Promise<string> {
  const result = streamText({
    model,
    system: DME_AGENT_INSTRUCTIONS,
    messages: [
      ...messages.slice(-29).map(({ role, content }) => ({ role, content })),
      { role: "user" as const, content: userMessage },
    ],
    tools: createCoordinationTools(action, activities),
    prepareStep: () => prepareAgentStep(action, activities.loadDmeContext),
    stopWhen: stepCountIs(6),
  });

  let answer = "";
  for await (const chunk of result.textStream) answer += chunk;
  if (!answer.trim()) throw new Error("The agent returned no answer");
  return answer;
}

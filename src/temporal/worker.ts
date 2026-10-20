import { config } from "dotenv";
import path from "node:path";
import { openai } from "@ai-sdk/openai";
import { AiSdkPlugin } from "@temporalio/ai-sdk";
import { NativeConnection, Worker } from "@temporalio/worker";
import * as dmeActivities from "./dme/activities";
import { CASE_TASK_QUEUE } from "./dme/constants";

config({ path: ".env.worker.local", quiet: true });

async function main() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required for the chat worker");

  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });
  const worker = await Worker.create({
    connection,
    taskQueue: CASE_TASK_QUEUE,
    workflowsPath: path.join(__dirname, "workflows.ts"),
    activities: dmeActivities,
    plugins: [new AiSdkPlugin({ modelProvider: openai })],
  });

  console.log(`Case worker polling ${CASE_TASK_QUEUE}`);
  try {
    await worker.run();
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

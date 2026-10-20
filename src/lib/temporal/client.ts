import { Client, Connection } from "@temporalio/client";

export async function createTemporalClient() {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });

  return {
    client: new Client({ connection }),
    close: () => connection.close(),
  };
}

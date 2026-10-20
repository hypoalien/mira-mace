import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const supplierSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().min(1),
  address: z.string().min(1),
  medicareEnrolled: z.boolean().default(true),
});

export async function listSuppliers() {
  const filename = path.join(process.cwd(), "data", "suppliers.json");
  return supplierSchema.array().parse(JSON.parse(await readFile(filename, "utf8")));
}

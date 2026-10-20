import { NextResponse } from "next/server";
import { createCaseFromIntake } from "@/lib/cases";

export async function POST() {
  const created = await createCaseFromIntake();
  return NextResponse.json(created, {
    status: 201,
    headers: { Location: `/cases/${created.id}` },
  });
}

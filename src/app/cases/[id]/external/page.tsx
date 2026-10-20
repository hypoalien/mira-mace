import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ExternalResponses } from "@/components/external-responses";
import { getCase } from "@/lib/cases";

export default async function ExternalResponsesPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const current = await getCase(id);
  if (!current) notFound();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-6 sm:px-10">
      <nav className="mb-5 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link href={`/cases/${encodeURIComponent(id)}`} className="hover:text-foreground">{current.intake.patient.name}</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">External responses</span>
      </nav>
      <ExternalResponses current={current} />
    </main>
  );
}

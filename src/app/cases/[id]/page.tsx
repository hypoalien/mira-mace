import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CaseDetailHeader } from "@/components/case-detail-header";
import { CaseStatusPanel } from "@/components/case-status-panel";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getCase } from "@/lib/cases";
import { listSuppliers } from "@/lib/suppliers";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const current = await getCase(id);
  if (!current) notFound();
  const supplierCount = (await listSuppliers()).length;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-5 sm:px-10">
      <nav className="mb-3 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-foreground">DME coordination</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{current.id}</span>
      </nav>

      <div className="w-full min-w-0 space-y-3">
        <CaseDetailHeader current={current} />
        <section className="grid w-full min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" aria-label="Case workspace">
          <Card className="min-h-[420px] gap-0 py-0 lg:min-h-[560px]">
            <CardHeader className="grid grid-cols-[1fr_auto] items-center px-4 py-3">
              <CardTitle>Conversation</CardTitle>
              <CardAction className="text-sm text-muted-foreground">Coming next</CardAction>
            </CardHeader>
            <Separator />
            <CardContent className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
              <h2 className="text-base font-medium">Conversation workspace</h2>
              <p className="mt-2 max-w-56 text-sm leading-6 text-muted-foreground">The chat panel will go here in a later step.</p>
            </CardContent>
          </Card>
          <Card className="min-h-[420px] gap-0 py-0 lg:min-h-[560px]" aria-label="Case information">
            <CardHeader className="grid grid-cols-[1fr_auto] items-center px-4 py-3">
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="px-0">
              <CaseStatusPanel current={current} supplierCount={supplierCount} />
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

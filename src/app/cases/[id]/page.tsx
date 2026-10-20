import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CaseDetailHeader } from "@/components/case-detail-header";
import { AgentStartProvider } from "@/components/agent-start-context";
import { CaseChatPanel } from "@/components/case-chat-panel";
import { CaseStatusPanel } from "@/components/case-status-panel";
import { HumanTasksPanel } from "@/components/human-tasks-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getCase } from "@/lib/cases";
import { listSuppliers } from "@/lib/suppliers";
import { upcomingBookedDeliveryWindow } from "@/lib/dme/fulfillment";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const current = await getCase(id);
  if (!current) notFound();
  const suppliers = await listSuppliers();
  const supplierCount = suppliers.filter((supplier) => supplier.medicareEnrolled).length;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-5 sm:px-10">
      <nav className="mb-3 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-foreground">DME coordination</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{current.id}</span>
      </nav>

      <AgentStartProvider>
      <div className="w-full min-w-0 space-y-3">
        <CaseDetailHeader current={current} suppliers={suppliers} />
        <section className="grid w-full min-w-0 items-stretch gap-4 lg:h-[calc(100dvh-22rem)] lg:min-h-[560px] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" aria-label="Case workspace">
          <CaseChatPanel
            key={`${current.id}:${current.generation}`}
            caseId={current.id}
            initialMessages={current.messages}
            initialPatientMessages={current.patientMessages}
            initialCheckpoints={current.checkpoints}
            activeChat={current.activeChat}
            agentWorking={current.coordination.state === "running"}
            autoMockEnabled={current.autoMock.enabled}
            deliveryTravelSlot={upcomingBookedDeliveryWindow(current)}
            recordedCalls={current.coordination.calls}
          />
          <Card className="h-full min-h-[560px] gap-0 overflow-hidden py-0 lg:min-h-0" aria-label="Case information">
            <CardHeader className="grid grid-cols-[1fr_auto] items-center px-4 py-3">
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="min-h-0 flex-1 overflow-y-auto px-0">
              <CaseStatusPanel current={current} supplierCount={supplierCount} />
              <HumanTasksPanel caseId={current.id} tasks={current.humanTasks} />
            </CardContent>
          </Card>
        </section>
      </div>
      </AgentStartProvider>
    </main>
  );
}

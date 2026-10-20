import Link from "next/link";
import { connection } from "next/server";
import { ArrowUpRight, BriefcaseMedical } from "lucide-react";
import { CreateCaseButton } from "@/components/create-case-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCases } from "@/lib/cases";

export default async function CasesPage() {
  await connection();
  const cases = await listCases();

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-10">
      <div className="mb-6 flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-sm font-semibold text-primary">Care advocate workspace</p>
          <h1 className="text-2xl font-semibold tracking-tight">Cases</h1>
          <p className="mt-2 text-sm text-muted-foreground">Track equipment requests from completed patient intake.</p>
        </div>
        <CreateCaseButton />
      </div>

      <Card className="gap-0 py-0" aria-label="All cases">
        <CardHeader className="grid grid-cols-[1fr_auto] items-center border-b px-5 py-4">
          <CardTitle>All cases</CardTitle>
          <CardAction className="text-sm text-muted-foreground">{cases.length} total</CardAction>
        </CardHeader>
        <CardContent className="px-0">
          {cases.length ? (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="px-6 text-muted-foreground">Case</TableHead>
                  <TableHead className="px-6 text-muted-foreground">Patient</TableHead>
                  <TableHead className="px-6 text-muted-foreground">Equipment</TableHead>
                  <TableHead className="px-6 text-muted-foreground">Status</TableHead>
                  <TableHead className="px-6 text-muted-foreground">Created</TableHead>
                  <TableHead className="px-6"><span className="sr-only">Open</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="px-6 py-3 text-xs text-muted-foreground">{item.id}</TableCell>
                    <TableCell className="px-6 py-3 font-semibold">{item.intake.patient.name}</TableCell>
                    <TableCell className="px-6 py-3">{item.intake.equipment.name}<span className="mt-1 block text-xs text-muted-foreground">{item.intake.equipment.hcpcs}</span></TableCell>
                    <TableCell className="px-6 py-3"><Badge variant="secondary" className="gap-2 border border-primary/15"><span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />{item.status}</Badge></TableCell>
                    <TableCell className="px-6 py-3">{new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</TableCell>
                    <TableCell className="px-6 py-3"><Link className="inline-flex items-center gap-1 font-semibold text-primary hover:underline" href={`/cases/${item.id}`}>Open case<ArrowUpRight className="size-4" aria-hidden="true" /></Link></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center px-6 py-20 text-center">
              <span className="mb-4 grid size-12 place-items-center rounded-xl bg-secondary text-primary"><BriefcaseMedical className="size-5" aria-hidden="true" /></span>
              <h2 className="text-lg font-semibold">No cases yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">Create the first case from the included Eleanor Martinez intake.</p>
            </div>
          )}
        </CardContent>
      </Card>
      <p className="mt-5 text-sm text-muted-foreground">New cases use the local <code className="text-xs">data/intake.json</code> fixture.</p>
    </main>
  );
}

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listSuppliers } from "@/lib/suppliers";

export default async function SuppliersPage() {
  const suppliers = await listSuppliers();
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-10">
      <div className="mb-6">
        <p className="mb-2 text-sm font-semibold text-primary">Reference directory</p>
        <h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1>
        <p className="mt-2 text-sm text-muted-foreground">The {suppliers.length} suppliers included with the take home data.</p>
      </div>
      <Card className="gap-0 py-0" aria-label="Supplier directory">
        <CardHeader className="grid grid-cols-[1fr_auto] items-center border-b px-5 py-4">
          <CardTitle>Supplier list</CardTitle>
          <CardAction className="text-sm text-muted-foreground">{suppliers.length} entries</CardAction>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader className="bg-muted/50"><TableRow><TableHead className="px-6 text-muted-foreground">Supplier</TableHead><TableHead className="px-6 text-muted-foreground">Phone</TableHead><TableHead className="px-6 text-muted-foreground">Address</TableHead></TableRow></TableHeader>
            <TableBody>{suppliers.map((supplier) => (
              <TableRow key={supplier.id}>
                <TableCell className="px-6 py-3 font-semibold">{supplier.name}<span className="mt-1 block text-xs font-normal text-muted-foreground">{supplier.id}</span></TableCell>
                <TableCell className="px-6 py-3">{supplier.phone}</TableCell>
                <TableCell className="px-6 py-3">{supplier.address}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}

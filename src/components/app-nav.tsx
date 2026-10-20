import Link from "next/link";

export function AppNav() {
  return (
    <header className="border-b bg-background">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-10">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Mira Mace{" "}
          <span className="font-normal text-muted-foreground">
            / DME coordination
          </span>
        </Link>
        <div className="flex gap-6 text-sm font-medium">
          <Link href="/" className="hover:text-muted-foreground">Cases</Link>
          <Link href="/suppliers" className="hover:text-muted-foreground">Suppliers</Link>
        </div>
      </nav>
    </header>
  );
}

import { Link, createFileRoute } from "@tanstack/react-router";
import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <h1 className="text-3xl font-semibold">tendera – Ausschreibungen im Griff</h1>
      <p className="text-muted-foreground">
        Analysieren Sie Vergabeunterlagen automatisch, vergleichen Sie Kriterien und teilen Sie Ergebnisse sicher im Team.
      </p>
      <SignedOut>
        <SignInButton mode="modal">
          <Button size="lg">Anmelden</Button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <div className="flex gap-3">
          <Link to="/profil">
            <Button>Zum Profil</Button>
          </Link>
          <Link to="/organisation">
            <Button variant="outline">Organisation</Button>
          </Link>
        </div>
      </SignedIn>
    </div>
  );
}

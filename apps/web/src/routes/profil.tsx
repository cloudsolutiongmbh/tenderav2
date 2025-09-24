import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserProfile,
} from "@clerk/clerk-react";

export const Route = createFileRoute("/profil")({
  component: ProfileRoute,
});

function ProfileRoute() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-6">
      <SignedIn>
        <h1 className="text-2xl font-semibold">Profil</h1>
        <p className="text-sm text-muted-foreground">Verwalte dein Konto.</p>

        <section className="rounded-lg border p-4">
          <h2 className="mb-3 font-medium">Benutzerprofil</h2>
          <UserProfile routing="hash" />
        </section>
      </SignedIn>

      <SignedOut>
        <div className="flex flex-col items-center gap-3 py-16">
          <p>Bitte anmelden, um das Profil zu sehen.</p>
          <SignInButton mode="modal">
            <Button>Anmelden</Button>
          </SignInButton>
        </div>
      </SignedOut>
    </div>
  );
}

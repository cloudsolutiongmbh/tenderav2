import { Button } from "@/components/ui/button";
import { createFileRoute } from "@tanstack/react-router";
import { SignedIn, SignedOut, SignInButton, OrganizationProfile } from "@clerk/clerk-react";

export const Route = createFileRoute("/organisation")({
  component: OrganisationRoute,
});

function OrganisationRoute() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 space-y-6">
      <SignedIn>
        <h1 className="text-2xl font-semibold">Organisation</h1>
        <p className="text-sm text-muted-foreground">
          Verwalte Mitgliedschaften, Sicherheit und Abrechnung.
        </p>

        <section className="rounded-lg border p-4">
          <OrganizationProfile routing="hash" afterLeaveOrganizationUrl="/" />
        </section>
      </SignedIn>

      <SignedOut>
        <div className="flex flex-col items-center gap-3 py-16">
          <p>Bitte anmelden, um Organisationen zu verwalten.</p>
          <SignInButton mode="modal">
            <Button>Anmelden</Button>
          </SignInButton>
        </div>
      </SignedOut>
    </div>
  );
}


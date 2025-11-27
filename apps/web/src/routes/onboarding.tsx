import { useEffect } from "react";

import { CreateOrganization, OrganizationSwitcher, SignInButton } from "@clerk/clerk-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrgAuth } from "@/hooks/useOrgAuth";

export const Route = createFileRoute("/onboarding")({
    component: OnboardingRoute,
});

function OnboardingRoute() {
    const auth = useOrgAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (auth.orgStatus === "ready") {
            navigate({ to: "/projekte", replace: true });
        }
    }, [auth.orgStatus, navigate]);

    if (auth.orgStatus === "loading") {
        return (
            <div className="flex h-full items-center justify-center">
                <Loader />
            </div>
        );
    }

    if (auth.orgStatus === "signedOut") {
        return (
            <div className="mx-auto flex h-full w-full max-w-md flex-col justify-center gap-6 px-4 py-10 text-center">
                <Card>
                    <CardHeader>
                        <CardTitle>Anmeldung erforderlich</CardTitle>
                        <CardDescription>Melde dich an, um deine Organisation zu verwalten.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <SignInButton
                            mode="redirect"
                            forceRedirectUrl="/onboarding"
                            signUpForceRedirectUrl="/onboarding"
                        >
                            <Button className="w-full">Anmelden</Button>
                        </SignInButton>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (auth.orgStatus === "ready") {
        return null;
    }

    return (
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-6 px-4 py-10">
            <Card>
                <CardHeader>
                    <CardTitle>Organisation auswählen oder anlegen</CardTitle>
                    <CardDescription>
                        Um fortzufahren, aktiviere eine bestehende Organisation oder lege eine neue an.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                    <div className="space-y-3">
                        <h2 className="text-lg font-medium">Bestehende Organisation aktivieren</h2>
                        <p className="text-sm text-muted-foreground">
                            Wähle eine Organisation, zu der du bereits gehörst.
                        </p>
                        <OrganizationSwitcher
                            hidePersonal
                            afterSwitchOrganizationUrl="/projekte"
                        />
                    </div>
                    <hr className="border-muted" />
                    <div className="space-y-3">
                        <h2 className="text-lg font-medium">Neue Organisation erstellen</h2>
                        <p className="text-sm text-muted-foreground">
                            Wenn du noch keine Organisation hast, erstelle jetzt eine neue.
                        </p>
                        <CreateOrganization afterCreateOrganizationUrl="/projekte" />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

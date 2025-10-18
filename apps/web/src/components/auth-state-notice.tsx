import { useEffect } from "react";

import { useNavigate } from "@tanstack/react-router";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInButton } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import type { OrgAuthStatus } from "@/hooks/useOrgAuth";

interface AuthStateNoticeProps {
	status: OrgAuthStatus;
}

const MESSAGES: Record<Extract<OrgAuthStatus, "loading" | "signedOut">, { title: string; description: string }> = {
	loading: {
		title: "Anmeldung wird geladen",
		description: "Bitte einen Moment Geduld…",
	},
	signedOut: {
		title: "Anmeldung erforderlich",
		description: "Melde dich bitte an, um diese Seite zu nutzen.",
	},
};

export function AuthStateNotice({ status }: AuthStateNoticeProps) {
	const navigate = useNavigate();

	useEffect(() => {
		if (status === "missingOrg") {
			navigate({ to: "/onboarding", replace: true });
		}
	}, [navigate, status]);

	if (status === "ready" || status === "missingOrg") {
		return null;
	}

	const { title, description } = MESSAGES[status];

	return (
		<div className="mx-auto flex w-full max-w-5xl px-4 py-10">
			<Card className="w-full">
				<CardHeader>
					<CardTitle>{title}</CardTitle>
					<CardDescription>{description}</CardDescription>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground">
					{status === "signedOut" ? (
						<div className="flex flex-col gap-3">
							<p>
								Melde dich an, um weiterzuarbeiten. Alternativ findest du den Anmelde-Button wie gewohnt unten in der Navigation.
							</p>
								<SignInButton
									mode="redirect"
									forceRedirectUrl="/onboarding"
									signUpForceRedirectUrl="/onboarding"
								>
									<Button className="w-fit">Jetzt anmelden</Button>
								</SignInButton>
						</div>
					) : (
						"Ladevorgang läuft…"
					)}
				</CardContent>
			</Card>
		</div>
	);
}

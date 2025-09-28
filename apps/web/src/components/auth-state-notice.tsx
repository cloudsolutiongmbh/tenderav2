import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrgAuthStatus } from "@/hooks/useOrgAuth";

interface AuthStateNoticeProps {
	status: OrgAuthStatus;
}

const MESSAGES: Record<Exclude<OrgAuthStatus, "ready">, { title: string; description: string }> = {
	loading: {
		title: "Anmeldung wird geladen",
		description: "Bitte einen Moment Geduld…",
	},
	signedOut: {
		title: "Anmeldung erforderlich",
		description: "Melde dich bitte an, um diese Seite zu nutzen.",
	},
	missingOrg: {
		title: "Organisation auswählen",
		description: "Bitte wähle im Menü eine Organisation aus, bevor du fortfährst.",
	},
};

export function AuthStateNotice({ status }: AuthStateNoticeProps) {
	if (status === "ready") {
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
					{status === "signedOut"
						? "Über die Schaltfläche oben rechts kannst du dich anmelden."
						: status === "missingOrg"
							? "Nutze das Organisations-Menü oben rechts, um eine Organisation zu aktivieren."
							: "Ladevorgang läuft…"}
				</CardContent>
			</Card>
		</div>
	);
}

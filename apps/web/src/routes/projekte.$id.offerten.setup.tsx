import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { api } from "@tendera/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, type AnalysisStatus } from "@/components/status-badge";
import { AuthStateNotice } from "@/components/auth-state-notice";
import { ProjectSectionLayout } from "@/components/project-section-layout";
import { useOrgAuth } from "@/hooks/useOrgAuth";

export const Route = createFileRoute("/projekte/$id/offerten/setup")({
	component: OffertenSetupPage,
});

function OffertenSetupPage() {
	const { id: projectId } = Route.useParams();
	const navigate = useNavigate();
	const auth = useOrgAuth();

	const project = useQuery(
		api.projects.get,
		auth.authReady ? { projectId: projectId as any } : "skip",
	);

	const documents = useQuery(
		api.documents.listByProject,
		auth.authReady ? { projectId: projectId as any } : "skip",
	);

	const [isExtracting, setExtracting] = useState(false);
	const extractCriteria = useAction(api.analysis.extractPflichtenheftCriteria);

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

	const pflichtenheft = documents?.find((doc) => doc.role === "pflichtenheft");
	const hasTemplate = Boolean(project?.project.templateId);

	const handleExtract = async () => {
		if (!pflichtenheft) {
			toast.error("Bitte zuerst ein Pflichtenheft hochladen.");
			return;
		}

		setExtracting(true);
		try {
			const result = await extractCriteria({ projectId: projectId as any });
			toast.success(`Kriterien erfolgreich extrahiert! ${result.criteriaCount} Kriterien gefunden.`);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Kriterien konnten nicht extrahiert werden.",
			);
		} finally {
			setExtracting(false);
		}
	};

	const handleContinue = () => {
		navigate({
			to: "/projekte/$id/offerten",
			params: { id: projectId },
		});
	};

	return (
		<ProjectSectionLayout
			projectId={projectId}
			projectName={project?.project.name}
			customer={project?.project.customer ?? null}
			section={{
				id: "offerten-setup",
				title: "Offerten-Vergleich Setup",
				description: "Lade das Pflichtenheft hoch und extrahiere die Kriterien.",
			}}
		>
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>1. Pflichtenheft hochladen</CardTitle>
						<CardDescription>
							Lade das Dokument hoch, das die Muss- und Kann-Kriterien enthält.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{pflichtenheft ? (
							<div className="rounded-md border border-green-200 bg-green-50 p-4">
								<p className="text-sm font-medium text-green-900">
									✓ Pflichtenheft hochgeladen: {pflichtenheft.filename}
								</p>
								<p className="mt-1 text-xs text-green-700">
									{pflichtenheft.pageCount ?? 0} Seiten
								</p>
							</div>
						) : (
							<div className="space-y-3">
								<p className="text-sm text-muted-foreground">
									Noch kein Pflichtenheft hochgeladen. Gehe zu "Dokumente" und lade das
									Pflichtenheft hoch.
								</p>
								<Button
									variant="outline"
									onClick={() =>
										navigate({
											to: "/projekte/$id/dokumente",
											params: { id: projectId },
										})
									}
								>
									Zu Dokumente
								</Button>
							</div>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>2. Kriterien extrahieren</CardTitle>
						<CardDescription>
							Automatische Extraktion aller Muss- und Kann-Kriterien aus dem Pflichtenheft.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						{hasTemplate ? (
							<div className="rounded-md border border-green-200 bg-green-50 p-4">
								<p className="text-sm font-medium text-green-900">
									✓ Kriterien wurden extrahiert
								</p>
								<p className="mt-1 text-xs text-green-700">
									Template wurde erstellt und mit dem Projekt verknüpft.
								</p>
							</div>
						) : (
							<>
								<p className="text-sm text-muted-foreground">
									Die KI wird automatisch alle Muss-Kriterien (obligatorisch) und
									Kann-Kriterien (optional/wünschenswert) aus dem Pflichtenheft extrahieren.
								</p>
								<Button
									onClick={handleExtract}
									disabled={!pflichtenheft || isExtracting}
								>
									{isExtracting ? (
										<>
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											Extrahiere Kriterien ...
										</>
									) : (
										"Kriterien extrahieren"
									)}
								</Button>
							</>
						)}
					</CardContent>
				</Card>

				{hasTemplate && (
					<Card>
						<CardHeader>
							<CardTitle>3. Weiter zu Offerten</CardTitle>
							<CardDescription>
								Setup abgeschlossen. Füge jetzt Angebote hinzu und vergleiche sie.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Button onClick={handleContinue}>Zu Offerten-Vergleich</Button>
						</CardContent>
					</Card>
				)}
			</div>
		</ProjectSectionLayout>
	);
}
import { useMemo, useState } from "react";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@tendera/backend/convex/_generated/api";
import {
	MetadataCard,
	MilestonesCard,
	RequirementsCard,
	SummaryCard,
} from "@/components/analysis-cards";
import { Loader2, Trash2 } from "lucide-react";

import { StatusBadge, type AnalysisStatus } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { AuthStateNotice } from "@/components/auth-state-notice";
import { ProjectSectionLayout } from "@/components/project-section-layout";
import { useOrgAuth } from "@/hooks/useOrgAuth";

interface Citation {
	page: number;
	quote: string;
}

interface StandardMilestone {
	title: string;
	date?: string;
	citation?: Citation;
}

interface StandardRequirement {
	title: string;
	category?: string;
	notes?: string;
	citation?: Citation;
}

interface StandardOpenQuestion {
	question: string;
	citation?: Citation;
}

interface StandardMetadataItem {
	label: string;
	value: string;
	citation?: Citation;
}

interface StandardResult {
	summary: string;
	milestones: StandardMilestone[];
	requirements: StandardRequirement[];
	openQuestions: StandardOpenQuestion[];
	metadata: StandardMetadataItem[];
}

interface RunSummary {
	status: AnalysisStatus;
	error?: string | null;
}


export const Route = createFileRoute("/projekte/$id/standard")({
	component: ProjectStandardPage,
});

function ProjectStandardPage() {
	const { id: projectId } = Route.useParams();
	const navigate = useNavigate();
	const auth = useOrgAuth();
	const project = useQuery(
		api.projects.get,
		auth.authReady ? { projectId: projectId as any } : "skip",
	);
	const standard = useQuery(
		api.analysis.getLatest,
		auth.authReady
			? {
				projectId: projectId as any,
				type: "standard",
			}
			: "skip",
	);

	const standardResult = useMemo<StandardResult | null>(() => {
		const result = standard?.result;
		if (isStandardResult(result)) {
			return result;
		}
		return null;
	}, [standard]);

	const runSummary = useMemo<RunSummary | null>(() => {
		if (!standard?.run) {
			return null;
		}
		return {
			status: standard.run.status,
			error: standard.run.error,
		};
	}, [standard]);

	const removeProject = useMutation(api.projects.remove);

	const projectMeta = project?.project;
	const isLoading = project === undefined || standard === undefined;
	const [isDeleting, setDeleting] = useState(false);

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

	const handleDeleteProject = async () => {
		const ok = window.confirm(
			"Dieses Projekt endgültig löschen? Alle Dokumente, Seiten und Analyse-Läufe werden entfernt.",
		);
		if (!ok) return;
		setDeleting(true);
		try {
			await removeProject({ projectId: projectId as any });
			toast.success("Projekt gelöscht.");
			navigate({ to: "/projekte" });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Projekt konnte nicht gelöscht werden.");
		} finally {
			setDeleting(false);
		}
	};

	return (
		<ProjectSectionLayout
			projectId={projectId}
			projectName={projectMeta?.name}
			customer={projectMeta?.customer ?? null}
			section={{
				id: "standard",
				title: "Standard-Analyse",
				description:
					"Automatisch extrahierte Zusammenfassung, Meilensteine, Anforderungen und wichtige Informationen aus Ihren Dokumenten.",
			}}
			statusBadge={<StatusBadge status={runSummary?.status ?? "wartet"} />}
			actions={
				<Button
					variant="ghost"
					size="icon"
					onClick={handleDeleteProject}
					disabled={isDeleting}
					title="Projekt löschen"
					aria-label="Projekt löschen"
				>
					{isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
				</Button>
			}
			headerContent={
				runSummary?.error || runSummary?.status === "läuft" || runSummary?.status === "wartet"
					? runSummary.error
						? `Analyse fehlgeschlagen: ${runSummary.error}`
						: runSummary.status === "läuft"
							? "Analyse läuft – Ergebnisse werden nach Abschluss angezeigt."
							: runSummary.status === "wartet"
								? "Analyse ist in der Warteschlange."
								: null
					: null
			}
		>
			<section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
				<div className="space-y-6">
					<SummaryCard
						summary={standardResult?.summary}
						isLoading={isLoading}
					/>
					<MilestonesCard
						milestones={standardResult?.milestones ?? []}
						isLoading={isLoading}
					/>
					<RequirementsCard
						requirements={standardResult?.requirements ?? []}
						isLoading={isLoading}
					/>
				</div>
				<div className="space-y-6">
					<MetadataCard
						metadata={standardResult?.metadata ?? []}
						isLoading={isLoading}
					/>
				</div>
			</section>
		</ProjectSectionLayout>
	);
}

function isStandardResult(value: unknown): value is StandardResult {
	if (!value || typeof value !== "object") {
		return false;
	}
	return (
		"summary" in value &&
		"milestones" in value &&
		Array.isArray((value as StandardResult).milestones) &&
		Array.isArray((value as StandardResult).requirements) &&
		Array.isArray((value as StandardResult).openQuestions) &&
		Array.isArray((value as StandardResult).metadata)
	);
}

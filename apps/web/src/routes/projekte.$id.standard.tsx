import { useMemo } from "react";

import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@tendera/backend/convex/_generated/api";
import {
	MetadataCard,
	MilestonesCard,
	QuestionsCard,
	RequirementsCard,
	SummaryCard,
} from "@/components/analysis-cards";
import { StatusBadge, type AnalysisStatus } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthStateNotice } from "@/components/auth-state-notice";
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

const placeholder: StandardResult = {
	summary:
		"Sobald eine Analyse vorliegt, erscheint hier die komprimierte Zusammenfassung der Ausschreibung.",
	milestones: [
		{
			title: "Abgabe Angebot",
			date: "2024-03-15",
			citation: { page: 5, quote: "Abgabefrist ist der 15. März 2024" },
		},
	],
	requirements: [
		{
			title: "Minergie-P Standard",
			category: "Technisch",
			notes: "Gebäudehülle gemäss SIA 380",
			citation: { page: 12, quote: "Gebäude muss Minergie-P erfüllen" },
		},
	],
	openQuestions: [
		{
			question: "Gibt es Vorgaben für die Möblierung?",
			citation: { page: 18, quote: "Möblierung optional" },
		},
	],
	metadata: [
		{ label: "Ausschreibungsnummer", value: "ZH-2024-001" },
		{ label: "Vergabestelle", value: "Stadt Winterthur" },
	],
};

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

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

	const handleDeleteProject = async () => {
		const ok = window.confirm(
			"Dieses Projekt endgültig löschen? Alle Dokumente, Seiten und Analyse-Läufe werden entfernt.",
		);
		if (!ok) return;
		try {
			await removeProject({ projectId: projectId as any });
			toast.success("Projekt gelöscht.");
			navigate({ to: "/projekte" });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Projekt konnte nicht gelöscht werden.");
		}
	};

	return (
		<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
			<Card>
				<CardHeader className="gap-2">
					<CardTitle className="text-2xl font-semibold">
						{projectMeta?.name ?? "Projekt"}
						{projectMeta?.customer ? ` · ${projectMeta.customer}` : null}
					</CardTitle>
					<CardDescription className="text-sm text-muted-foreground">
						Diese Ansicht zeigt den aktuellen Stand der Standard-Analyse. Ohne Ergebnis werden Platzhalter angezeigt.
					</CardDescription>
					<div className="flex flex-wrap items-center gap-3">
						<StatusBadge status={runSummary?.status ?? "wartet"} />
						<nav className="flex flex-wrap gap-2 text-sm">
							<Link
								to="/projekte/$id/standard"
								params={{ id: projectId }}
								className="rounded-md bg-primary px-3 py-1 text-primary-foreground"
							>
								Standard
							</Link>
							<Link
								to="/projekte/$id/kriterien"
								params={{ id: projectId }}
								className="rounded-md border px-3 py-1"
							>
								Kriterien
							</Link>
							<Link
								to="/projekte/$id/dokumente"
								params={{ id: projectId }}
								className="rounded-md border px-3 py-1"
							>
								Dokumente
							</Link>
							<Link
								to="/projekte/$id/kommentare"
								params={{ id: projectId }}
								className="rounded-md border px-3 py-1"
							>
								Kommentare
							</Link>
							<Link
								to="/projekte/$id/export"
								params={{ id: projectId }}
								className="rounded-md border px-3 py-1"
							>
								Export
							</Link>
						</nav>
						<button
							onClick={handleDeleteProject}
							className="rounded-md border border-destructive text-destructive px-3 py-1"
						>
							Projekt löschen
						</button>
					</div>
				</CardHeader>
				{runSummary?.error || runSummary?.status === "läuft" || runSummary?.status === "wartet" ? (
					<CardContent className="text-sm text-muted-foreground">
						{runSummary.error
							? `Analyse fehlgeschlagen: ${runSummary.error}`
							: runSummary.status === "läuft"
								? "Analyse läuft – Ergebnisse werden nach Abschluss angezeigt."
								: runSummary.status === "wartet"
									? "Analyse ist in der Warteschlange."
									: null}
					</CardContent>
				) : null}
			</Card>

			<section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
				<div className="space-y-6">
					<SummaryCard
						summary={standardResult?.summary ?? placeholder.summary}
						isLoading={isLoading}
					/>
					<MilestonesCard
						milestones={standardResult?.milestones ?? placeholder.milestones}
						isLoading={isLoading}
					/>
					<RequirementsCard
						requirements={standardResult?.requirements ?? placeholder.requirements}
						isLoading={isLoading}
					/>
				</div>
				<div className="space-y-6">
					<QuestionsCard
						questions={standardResult?.openQuestions ?? placeholder.openQuestions}
						isLoading={isLoading}
					/>
					<MetadataCard
						metadata={standardResult?.metadata ?? placeholder.metadata}
						isLoading={isLoading}
					/>
				</div>
			</section>
		</div>
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

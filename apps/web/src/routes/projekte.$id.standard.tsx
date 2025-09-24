import { useMemo } from "react";

import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { api } from "@tendera/backend/convex/_generated/api";
import {
	MetadataCard,
	MilestonesCard,
	QuestionsCard,
	RequirementsCard,
	SummaryCard,
} from "@/components/analysis-cards";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
	const project = useQuery(api.projects.get, { projectId: projectId as any });
	const standard = useQuery(api.analysis.getLatest, {
		projectId: projectId as any,
		type: "standard",
	});

	const standardResult = useMemo<StandardResult | null>(() => {
		const result = standard?.result;
		if (isStandardResult(result)) {
			return result;
		}
		return null;
	}, [standard]);
	const projectMeta = project?.project;

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
						<StatusBadge status={standard?.run?.status ?? "wartet"} />
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
						</nav>
					</div>
				</CardHeader>
			</Card>

			<section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
				<div className="space-y-6">
					<SummaryCard summary={standardResult?.summary ?? placeholder.summary} />
					<MilestonesCard milestones={standardResult?.milestones ?? placeholder.milestones} />
					<RequirementsCard requirements={standardResult?.requirements ?? placeholder.requirements} />
				</div>
				<div className="space-y-6">
					<QuestionsCard questions={standardResult?.openQuestions ?? placeholder.openQuestions} />
					<MetadataCard metadata={standardResult?.metadata ?? placeholder.metadata} />
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

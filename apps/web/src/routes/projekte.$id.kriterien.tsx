import { useMemo, useState } from "react";

import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@tendera/backend/convex/_generated/api";
import { CriteriaDetail, CriteriaList } from "@/components/criteria-panel";
import type { CriteriaDetailData, CriteriaListItem } from "@/components/criteria-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/projekte/$id/kriterien")({
	component: ProjectCriteriaPage,
});

function ProjectCriteriaPage() {
	const { id: projectId } = Route.useParams();
	const project = useQuery(api.projects.get, { projectId: projectId as any });
	const criteriaResult = useQuery(api.analysis.getLatest, {
		projectId: projectId as any,
		type: "criteria",
	});
	const documents = useQuery(api.documents.listByProject, { projectId: projectId as any });
	const startAnalysis = useMutation(api.projects.startAnalysis);

	const resolvedCriteria = useMemo<CriteriaDetailData[]>(() => {
		const result = criteriaResult?.result;
		if (isCriteriaResult(result)) {
			return result.items.map((item) => ({
				...item,
				status: mapCriteriaStatus(item.status),
				citations: item.citations ?? [],
			}));
		}
		return placeholderCriteria;
	}, [criteriaResult]);

	const items: CriteriaListItem[] = useMemo(
		() =>
			resolvedCriteria.map((item) => ({
				criterionId: item.criterionId,
				title: item.title,
				status: item.status,
			})),
		[resolvedCriteria],
	);

	const [selectedId, setSelectedId] = useState<string | undefined>(items[0]?.criterionId);
	const activeCriterion = useMemo(() => {
		const fallback = resolvedCriteria[0] ?? placeholderCriteria[0];
		if (!selectedId) {
			return fallback;
		}
		return resolvedCriteria.find((item) => item.criterionId === selectedId) ?? fallback;
	}, [resolvedCriteria, selectedId]);

	const hasTemplate = Boolean(project?.project.templateId);
	const hasPages = useMemo(
		() => (documents ?? []).some((doc) => doc.textExtracted && (doc.pageCount ?? 0) > 0),
		[documents],
	);

	const handleStart = async () => {
		if (!hasTemplate) {
			toast.error("Bitte zuerst ein Template zuweisen.");
			return;
		}
		try {
			await startAnalysis({ projectId: projectId as any, type: "criteria" });
			toast.success("Kriterien-Analyse gestartet.");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Analyse konnte nicht gestartet werden.",
			);
		}
	};

	return (
		<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
			<Card>
				<CardHeader className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle>Kriterien-Analyse</CardTitle>
						<CardDescription>
							Vergleich der Angebotsunterlagen gegen das hinterlegte Template.
						</CardDescription>
					</div>
					<div className="flex gap-2">
						<Link
							to="/projekte/$id/standard"
							params={{ id: projectId }}
							className="rounded-md border px-3 py-1 text-sm"
						>
							Standard
						</Link>
						<Link
							to="/projekte/$id/dokumente"
							params={{ id: projectId }}
							className="rounded-md border px-3 py-1 text-sm"
						>
							Dokumente
						</Link>
						<Button size="sm" onClick={handleStart} disabled={!hasPages || !hasTemplate}>
							Analyse starten
						</Button>
					</div>
				</CardHeader>
			</Card>

			{!hasTemplate ? (
				<Card>
					<CardContent className="text-sm text-muted-foreground">
						Dieses Projekt hat noch kein Template zugewiesen. Wähle in der Projektübersicht ein Template aus,
						um Kriterien zu analysieren.
					</CardContent>
				</Card>
			) : null}

			<section className="grid gap-6 lg:grid-cols-[280px_1fr]">
				<div className="lg:sticky lg:top-20">
					<CriteriaList items={items} selectedId={selectedId} onSelect={setSelectedId} />
				</div>
				<CriteriaDetail criterion={activeCriterion} />
			</section>
		</div>
	);
}

interface CriteriaResultItem
	extends Omit<CriteriaDetailData, "status" | "citations"> {
	status?: CriteriaDetailData["status"];
	citations?: CriteriaDetailData["citations"];
}

interface CriteriaResultPayload {
	items: CriteriaResultItem[];
}

const placeholderCriteria: CriteriaDetailData[] = [
	{
		criterionId: "C1",
		title: "Nachhaltigkeitskonzept",
		status: "gefunden",
		description: "Nachweis eines zertifizierten Energiekonzepts",
		comment:
			"Die Anforderungen werden erfüllt. Es liegt ein Minergie-P Zertifikat sowie ein Monitoring-Konzept vor.",
		citations: [{ page: 12, quote: "Kapitel Nachhaltigkeit beschreibt das Konzept ausführlich." }],
	},
];

function isCriteriaResult(value: unknown): value is CriteriaResultPayload {
	if (!value || typeof value !== "object") {
		return false;
	}
	return Array.isArray((value as CriteriaResultPayload).items);
}

function mapCriteriaStatus(
	status: "gefunden" | "nicht_gefunden" | "teilweise" | "unbekannt" | undefined,
): "gefunden" | "nicht_gefunden" | "teilweise" | "unbekannt" {
	return status ?? "unbekannt";
}

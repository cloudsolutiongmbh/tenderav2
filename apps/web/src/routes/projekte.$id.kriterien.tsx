import { useEffect, useMemo, useState } from "react";

import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@tendera/backend/convex/_generated/api";
import { CriteriaDetail, CriteriaList } from "@/components/criteria-panel";
import type { CriteriaDetailData, CriteriaListItem } from "@/components/criteria-panel";
import { StatusBadge, type AnalysisStatus } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthStateNotice } from "@/components/auth-state-notice";
import { useOrgAuth } from "@/hooks/useOrgAuth";

interface RunSummary {
	status: AnalysisStatus;
	error?: string | null;
}

interface TemplateOption {
	_id: string;
	name: string;
	version?: string;
	language?: string;
}

export const Route = createFileRoute("/projekte/$id/kriterien")({
	component: ProjectCriteriaPage,
});

function ProjectCriteriaPage() {
	const { id: projectId } = Route.useParams();
	const auth = useOrgAuth();
	const project = useQuery(
		api.projects.get,
		auth.authReady ? { projectId: projectId as any } : "skip",
	);
	const criteriaResult = useQuery(
		api.analysis.getLatest,
		auth.authReady
			? {
				projectId: projectId as any,
				type: "criteria",
			}
			: "skip",
	);
	const documents = useQuery(
		api.documents.listByProject,
		auth.authReady ? { projectId: projectId as any } : "skip",
	);
	const templates = useQuery(
		api.templates.list,
		auth.authReady ? undefined : "skip",
	) as TemplateOption[] | undefined;
	const templateDoc = useQuery(
		api.templates.get,
		auth.authReady && project?.project.templateId
			? { templateId: project.project.templateId as any }
			: "skip",
	);

	const startAnalysis = useMutation(api.projects.startAnalysis);
	const setTemplate = useMutation(api.projects.setTemplate);

	const runSummary = useMemo<RunSummary | null>(() => {
		if (!criteriaResult?.run) {
			return null;
		}
		return {
			status: criteriaResult.run.status,
			error: criteriaResult.run.error,
		};
	}, [criteriaResult]);

	const computedCriteria = useMemo<CriteriaDetailData[]>(() => {
		const result = criteriaResult?.result;
		if (isCriteriaResult(result)) {
			return result.items.map((item) => ({
				...item,
				status: mapCriteriaStatus(item.status),
				citations: item.citations ?? [],
			}));
		}
		if (templateDoc) {
			return templateDoc.criteria.map((criterion) => ({
				criterionId: criterion.key,
				title: criterion.title,
				description: criterion.description ?? undefined,
				hints: criterion.hints ?? undefined,
				status: "unbekannt" as const,
				comment: undefined,
				answer: undefined,
				score: undefined,
				weight: criterion.weight,
				citations: [],
			}));
		}
		return placeholderCriteria;
	}, [criteriaResult, templateDoc]);

	const items: CriteriaListItem[] = useMemo(
		() =>
			computedCriteria.map((item) => ({
				criterionId: item.criterionId,
				title: item.title,
				status: item.status,
			})),
		[computedCriteria],
	);

	const [selectedId, setSelectedId] = useState<string | undefined>(items[0]?.criterionId);
	const activeCriterion = useMemo(() => {
		const fallback = computedCriteria[0] ?? placeholderCriteria[0];
		if (!selectedId) {
			return fallback;
		}
		return computedCriteria.find((item) => item.criterionId === selectedId) ?? fallback;
	}, [computedCriteria, selectedId]);

	const hasTemplate = Boolean(project?.project.templateId);
	const hasPages = useMemo(
		() => (documents ?? []).some((doc) => doc.textExtracted && (doc.pageCount ?? 0) > 0),
		[documents],
	);

	const [isAssigningTemplate, setAssigningTemplate] = useState(false);

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

	const handleTemplateChange = async (templateId: string) => {
		setAssigningTemplate(true);
		try {
			await setTemplate({
				projectId: projectId as any,
				templateId: templateId ? (templateId as any) : undefined,
			});
			toast.success("Template aktualisiert.");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Template konnte nicht gespeichert werden.",
			);
		} finally {
			setAssigningTemplate(false);
		}
	};

	const handleStart = async () => {
		if (!hasTemplate) {
			toast.error("Bitte zuerst ein Template zuweisen.");
			return;
		}
		if (!hasPages) {
			toast.error("Bitte zuerst Dokumente hochladen und extrahieren.");
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

	const isLoading =
		project === undefined || criteriaResult === undefined || documents === undefined || templates === undefined;
	const currentTemplate = useMemo(
		() => templates?.find((entry) => entry._id === project?.project.templateId) ?? null,
		[templates, project?.project.templateId],
	);

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
					<div className="flex items-center gap-3">
						<StatusBadge status={runSummary?.status ?? "wartet"} />
						<Button size="sm" onClick={handleStart} disabled={!hasPages || !hasTemplate}>
							Analyse starten
						</Button>
						<nav className="flex flex-wrap gap-2 text-sm">
							<Link
								to="/projekte/$id/standard"
								params={{ id: projectId }}
								className="rounded-md border px-3 py-1"
							>
								Standard
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
					</div>
				</CardHeader>
				{runSummary?.error || runSummary?.status === "läuft" || runSummary?.status === "wartet" ? (
					<CardContent className="text-sm text-muted-foreground">
						{runSummary.error
							? `Analyse fehlgeschlagen: ${runSummary.error}`
							: runSummary.status === "läuft"
								? "Analyse läuft – Ergebnisse erscheinen nach Abschluss."
								: runSummary.status === "wartet"
									? "Analyse ist in der Warteschlange."
									: null}
					</CardContent>
				) : null}
			</Card>

			<TemplateAssignmentCard
				isLoading={templates === undefined}
				templates={templates ?? []}
				currentTemplate={currentTemplate}
				onChange={handleTemplateChange}
				isAssigning={isAssigningTemplate}
			/>

			{!hasPages ? (
				<Card>
					<CardContent className="text-sm text-muted-foreground">
						Es wurden noch keine Dokumentseiten extrahiert. Lade Dokumente im Reiter „Dokumente“ hoch, um die Analyse zu starten.
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

function TemplateAssignmentCard({
	isLoading,
	templates,
	currentTemplate,
	onChange,
	isAssigning,
}: {
	isLoading: boolean;
	templates: TemplateOption[];
	currentTemplate: TemplateOption | null;
	onChange: (templateId: string) => Promise<void>;
	isAssigning: boolean;
}) {
	const templateKey = currentTemplate?._id ?? "";
	const [selected, setSelected] = useState(templateKey);

	useEffect(() => {
		setSelected(templateKey);
	}, [templateKey]);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		await onChange(selected);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Template</CardTitle>
				<CardDescription>
					{currentTemplate
						? `Aktuell: ${currentTemplate.name}${currentTemplate.version ? ` · ${currentTemplate.version}` : ""}`
						: "Wähle ein Template, um die Kriterien-Analyse zu aktivieren."}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<p className="text-sm text-muted-foreground">Lade Templates …</p>
				) : templates.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						Noch keine Templates vorhanden. Erstelle eines im Bereich „Templates“.
					</p>
				) : (
					<form className="flex flex-col gap-3 sm:flex-row sm:items-center" onSubmit={handleSubmit}>
						<select
							value={selected}
							onChange={(event) => setSelected(event.target.value)}
							className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
						>
							<option value="">Kein Template</option>
							{templates.map((template) => (
								<option key={template._id} value={template._id}>
									{template.name}
									{template.version ? ` · ${template.version}` : ""}
								</option>
							))}
						</select>
						<Button type="submit" disabled={isAssigning}>
							{isAssigning ? "Speichere …" : "Template speichern"}
						</Button>
					</form>
				)}
			</CardContent>
		</Card>
	);
}

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

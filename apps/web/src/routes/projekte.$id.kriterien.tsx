import { useEffect, useMemo, useState } from "react";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@tendera/backend/convex/_generated/api";
import { CriteriaDetail, CriteriaList } from "@/components/criteria-panel";
import type { CriteriaDetailData, CriteriaListItem } from "@/components/criteria-panel";
import { Loader2, Trash2 } from "lucide-react";

import { StatusBadge, type AnalysisStatus } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthStateNotice } from "@/components/auth-state-notice";
import { ProjectSectionLayout } from "@/components/project-section-layout";
import { useOrgAuth } from "@/hooks/useOrgAuth";
import type { Doc, Id } from "@tendera/backend/convex/_generated/dataModel";

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
    const navigate = useNavigate();
	const auth = useOrgAuth();
	const project = useQuery(
		api.projects.get,
		auth.authReady ? { projectId: projectId as Id<"projects"> } : "skip",
	);
	const criteriaResult = useQuery(
		api.analysis.getLatest,
		auth.authReady
			? {
				projectId: projectId as Id<"projects">,
				type: "criteria",
			}
			: "skip",
	);
	const documents = useQuery(
		api.documents.listByProject,
		auth.authReady ? { projectId: projectId as Id<"projects"> } : "skip",
	);
	const templates = useQuery(
		api.templates.list,
		auth.authReady ? undefined : "skip",
	) as TemplateOption[] | undefined;
	const templateDoc = useQuery(
		api.templates.get,
		auth.authReady && project?.project.templateId
			? { templateId: project.project.templateId as Id<"templates"> }
			: "skip",
	);

	const templateCriteriaMap = useMemo(() => {
		const map = new Map<string, Doc<"templates">["criteria"][number]>();
		if (templateDoc) {
			for (const criterion of templateDoc.criteria) {
				map.set(criterion.key, criterion);
			}
		}
		return map;
	}, [templateDoc]);

    const startAnalysis = useMutation(api.projects.startAnalysis);
    const runCriteriaForProject = useAction(api.analysis.runCriteriaForProject);
    const removeProject = useMutation(api.projects.remove);
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
			return result.items.map((item) => {
				const templateCriterion = templateCriteriaMap.get(item.criterionId);
				return {
					...item,
					status: mapCriteriaStatus(item.status),
					citations: item.citations ?? [],
					sourcePages: templateCriterion?.sourcePages ?? [],
					weight: item.weight ?? templateCriterion?.weight,
				};
			});
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
				sourcePages: criterion.sourcePages ?? [],
			}));
		}
		return [];
	}, [criteriaResult, templateDoc, templateCriteriaMap]);

	const items: CriteriaListItem[] = useMemo(
		() =>
			computedCriteria.map((item) => ({
				criterionId: item.criterionId,
				title: item.title,
				status: item.status,
			})),
		[computedCriteria],
	);

	const statusBreakdown = useMemo(() => {
		return computedCriteria.reduce(
			(acc, item) => {
				acc[item.status] = (acc[item.status] ?? 0) + 1;
				return acc;
			},
			{ gefunden: 0, teilweise: 0, nicht_gefunden: 0, unbekannt: 0 } as Record<CriteriaListItem["status"], number>,
		);
	}, [computedCriteria]);

	const [selectedId, setSelectedId] = useState<string | undefined>(items[0]?.criterionId);
	const activeCriterion = useMemo(() => {
		if (!selectedId && computedCriteria.length > 0) {
			return computedCriteria[0];
		}
		return computedCriteria.find((item) => item.criterionId === selectedId);
	}, [computedCriteria, selectedId]);

	const hasTemplate = Boolean(project?.project.templateId);
	const hasPages = useMemo(
		() => (documents ?? []).some((doc) => doc.textExtracted && (doc.pageCount ?? 0) > 0),
		[documents],
	);

    const [isAssigningTemplate, setAssigningTemplate] = useState(false);
    const [isDeleting, setDeleting] = useState(false);

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

	const handleTemplateChange = async (templateId: string) => {
		setAssigningTemplate(true);
		try {
			await setTemplate({
				projectId: projectId as Id<"projects">,
				templateId: templateId ? (templateId as Id<"templates">) : undefined,
			});
			toast.success("Kriterienkatalog aktualisiert.");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Kriterienkatalog konnte nicht gespeichert werden.",
			);
		} finally {
			setAssigningTemplate(false);
		}
	};

    const handleStart = async () => {
        if (!hasTemplate) {
            toast.error("Bitte zuerst einen Kriterienkatalog zuweisen.");
            return;
        }
        if (!hasPages) {
            toast.error("Bitte zuerst Dokumente hochladen und extrahieren.");
            return;
        }
        try {
            const res = (await startAnalysis({ projectId: projectId as Id<"projects">, type: "criteria" })) as
                | { status: "läuft" | "wartet"; runId: string }
                | undefined;
            if (res?.status === "läuft") {
                await runCriteriaForProject({ projectId: projectId as Id<"projects"> });
            }
            toast.success("Kriterien-Analyse gestartet.");
        } catch (error) {
            toast.error(
                error instanceof Error
                    ? error.message
                    : "Analyse konnte nicht gestartet werden.",
            );
        }
    };

    const handleDeleteProject = async () => {
        const ok = window.confirm(
            "Dieses Projekt endgültig löschen? Alle Dokumente, Seiten und Analyse-Läufe werden entfernt.",
        );
        if (!ok) return;
        setDeleting(true);
        try {
            await removeProject({ projectId: projectId as Id<"projects"> });
            toast.success("Projekt gelöscht.");
            navigate({ to: "/projekte" });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Projekt konnte nicht gelöscht werden.");
        } finally {
            setDeleting(false);
        }
    };

	const isLoading =
		project === undefined || criteriaResult === undefined || documents === undefined || templates === undefined;
	const currentTemplate = useMemo(
		() => templates?.find((entry) => entry._id === project?.project.templateId) ?? null,
		[templates, project?.project.templateId],
	);

	return (
		<ProjectSectionLayout
			projectId={projectId}
			projectName={project?.project.name}
			customer={project?.project.customer ?? null}
			section={{
				id: "kriterien",
				title: "Kriterien-Analyse",
				description: "Prüfung Ihrer Dokumente anhand individueller Anforderungen und Kriterien.",
			}}
			statusBadge={<StatusBadge status={runSummary?.status ?? "wartet"} />}
			actions={
				<div className="flex flex-wrap items-center gap-2">
					<Button size="sm" onClick={handleStart} disabled={!hasPages || !hasTemplate}>
						Analyse starten
					</Button>
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
				</div>
			}
			headerContent={
				runSummary?.error || runSummary?.status === "läuft" || runSummary?.status === "wartet"
					? runSummary.error
						? `Analyse fehlgeschlagen: ${runSummary.error}`
						: runSummary.status === "läuft"
							? "Analyse läuft – Ergebnisse erscheinen nach Abschluss."
							: runSummary.status === "wartet"
								? "Analyse ist in der Warteschlange."
								: null
					: null
			}
		>
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

			<Card>
				<CardHeader>
					<CardTitle>Kriterien</CardTitle>
					<CardDescription>
						Ergebnisse der Analyse – Muss-Kriterien zuerst, danach optionale Anforderungen.
					</CardDescription>
					<div className="flex flex-wrap gap-2 pt-3 text-xs text-muted-foreground">
						<StatusPill label="Gefunden" tone="success" value={statusBreakdown.gefunden} />
						<StatusPill label="Teilweise" tone="warn" value={statusBreakdown.teilweise} />
						<StatusPill label="Nicht gefunden" tone="error" value={statusBreakdown.nicht_gefunden} />
						<StatusPill label="Nicht bewertet" tone="muted" value={statusBreakdown.unbekannt} />
					</div>
				</CardHeader>
				<CardContent>
					{items.length === 0 ? (
						<div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
							<p className="text-sm font-medium text-foreground">
								Noch keine Kriterien vorhanden
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								Weise einen Kriterienkatalog zu oder starte eine Analyse, um Kriterien anzuzeigen.
							</p>
						</div>
					) : activeCriterion ? (
						<div className="grid gap-6 lg:grid-cols-[320px_1fr]">
							<div className="lg:sticky lg:top-28">
								<CriteriaList items={items} selectedId={selectedId} onSelect={setSelectedId} />
							</div>
							<CriteriaDetail criterion={activeCriterion} />
						</div>
					) : null}
				</CardContent>
			</Card>
		</ProjectSectionLayout>
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
				<CardTitle>Kriterienkatalog</CardTitle>
				<CardDescription>
					{currentTemplate
						? `Aktuell: ${currentTemplate.name}${currentTemplate.version ? ` · ${currentTemplate.version}` : ""}`
						: "Wähle einen Kriterienkatalog, um die Kriterien-Analyse zu aktivieren."}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<p className="text-sm text-muted-foreground">Lade Kriterienkataloge …</p>
				) : templates.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						Noch keine Kriterienkataloge vorhanden. Erstelle einen im Bereich „Kriterienkataloge".
					</p>
				) : (
					<form className="flex flex-col gap-3 sm:flex-row sm:items-center" onSubmit={handleSubmit}>
						<select
							value={selected}
							onChange={(event) => setSelected(event.target.value)}
							className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
						>
							<option value="">Kein Katalog</option>
							{templates.map((template) => (
								<option key={template._id} value={template._id}>
									{template.name}
									{template.version ? ` · ${template.version}` : ""}
								</option>
							))}
						</select>
						<Button type="submit" disabled={isAssigning}>
							{isAssigning ? "Speichere …" : "Katalog zuweisen"}
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

function StatusPill({
	label,
	value,
	tone,
}: {
	label: string;
	value: number;
	tone: "success" | "warn" | "error" | "muted";
}) {
	const toneClass = {
		success: "bg-emerald-100 text-emerald-900",
		warn: "bg-amber-100 text-amber-900",
		error: "bg-rose-100 text-rose-900",
		muted: "bg-muted text-muted-foreground",
	}[tone];

	return (
		<span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-medium ${toneClass}`}>
			{label}
			<span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold text-foreground">
				{value}
			</span>
		</span>
	);
}

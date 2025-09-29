import { useMemo, useState } from "react";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { Loader2, Trash2 } from "lucide-react";

import { api } from "@tendera/backend/convex/_generated/api";
import {
	MetadataCard,
	MilestonesCard,
	QuestionsCard,
	RequirementsCard,
	SummaryCard,
} from "@/components/analysis-cards";
import { ShareLink } from "@/components/share-link";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthStateNotice } from "@/components/auth-state-notice";
import { ProjectSectionLayout } from "@/components/project-section-layout";
import { useOrgAuth } from "@/hooks/useOrgAuth";

interface Citation {
	page: number;
	quote: string;
}

interface StandardResultShape {
	summary: string;
	milestones: Array<{ title: string; date?: string; citation?: Citation }>;
	requirements: Array<{ title: string; category?: string; notes?: string; citation?: Citation }>;
	openQuestions: Array<{ question: string; citation?: Citation }>;
	metadata: Array<{ label: string; value: string; citation?: Citation }>;
}

interface CriteriaItem {
	criterionId: string;
	title: string;
	status: "gefunden" | "nicht_gefunden" | "teilweise" | "unbekannt";
	comment?: string;
	answer?: string;
	score?: number;
	citations: Citation[];
}

interface ShareInfo {
	token: string;
	expiresAt: number;
}

export const Route = createFileRoute("/projekte/$id/export")({
	component: ProjectExportPage,
});

function ProjectExportPage() {
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
	const criteria = useQuery(
		api.analysis.getLatest,
		auth.authReady
			? {
				projectId: projectId as any,
				type: "criteria",
			}
			: "skip",
	);

	const createShare = useMutation(api.shares.create);
	const removeProject = useMutation(api.projects.remove);
	const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
	const [isCreatingShare, setCreatingShare] = useState(false);
	const [isDeleting, setDeleting] = useState(false);

	const projectMeta = project?.project;
	const standardResult = useMemo<StandardResultShape | null>(() => {
		const result = standard?.result;
		if (isStandardResult(result)) {
			return result;
		}
		return null;
	}, [standard]);

	const criteriaItems = useMemo<CriteriaItem[]>(() => {
		const result = criteria?.result;
		if (isCriteriaResult(result)) {
			return result.items.map((item) => ({
				...item,
				status: mapCriteriaStatus(item.status),
				citations: item.citations ?? [],
			}));
		}
		return [];
	}, [criteria]);

	const isLoading =
		project === undefined || standard === undefined || criteria === undefined;

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

	const handleCreateShare = async (ttlDays: number) => {
		setCreatingShare(true);
		try {
			const { token, expiresAt } = await createShare({
				projectId: projectId as any,
				ttlDays,
			});
			setShareInfo({ token, expiresAt });
			toast.success("Freigabelink erstellt.");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Freigabelink konnte nicht erstellt werden.",
			);
		} finally {
			setCreatingShare(false);
		}
	};

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
				id: "export",
				title: "Export",
				description:
					"Vollständiger Bericht mit allen Analyseergebnissen. Exportieren Sie als PDF oder teilen Sie einen Link.",
			}}
			className="print:bg-white"
			actions={
				<div className="flex items-center gap-2">
					<PdfExportButton disabled={isLoading} />
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
			headerContent={null}
			contentClassName="print:bg-white"
		>
			<section className="space-y-6">
				<SummaryCard
					summary={standardResult?.summary ?? "Noch keine Standard-Analyse verfügbar."}
					isLoading={isLoading}
				/>
				<div className="grid gap-6 lg:grid-cols-2">
					<MilestonesCard
						milestones={standardResult?.milestones ?? []}
						isLoading={isLoading}
					/>
					<MetadataCard
						metadata={standardResult?.metadata ?? []}
						isLoading={isLoading}
					/>
				</div>
				<RequirementsCard
					requirements={standardResult?.requirements ?? []}
					title="Wesentliche Anforderungen"
					description="Fachliche und technische Anforderungen aus den Ausschreibungsunterlagen."
					isLoading={isLoading}
				/>
				<QuestionsCard
					questions={standardResult?.openQuestions ?? []}
					isLoading={isLoading}
				/>
			</section>

			<Card>
				<CardHeader>
					<CardTitle>Kriterien-Ergebnisse</CardTitle>
					<CardDescription>
						Bewertung der Kriterien-basierenden Analyse mit Status und Fundstellen.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{isLoading ? (
						<p className="text-sm text-muted-foreground">Lade Kriterien …</p>
					) : criteriaItems.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							Noch keine Kriterien-Ergebnisse verfügbar. Starte eine Kriterien-Analyse im Dokumente-Reiter.
						</p>
					) : (
						criteriaItems.map((item) => (
							<div key={item.criterionId} className="rounded-lg border border-border/60 p-4">
								<div className="flex flex-wrap items-center justify-between gap-3">
									<h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
									<span className={statusBadgeClass(item.status)}>{mapStatusLabel(item.status)}</span>
								</div>
								{item.comment ? (
									<p className="mt-2 text-sm text-muted-foreground">{item.comment}</p>
								) : null}
								{item.answer ? (
									<p className="mt-2 text-sm text-muted-foreground">
										Antwort: {item.answer}
									</p>
								) : null}
								{item.citations.length > 0 ? (
									<ul className="mt-3 space-y-1 text-xs text-muted-foreground">
										{item.citations.map((citation, index) => (
											<li key={`${citation.page}-${index}`}>
												Seite {citation.page}: „{citation.quote}“
											</li>
										))}
									</ul>
								) : null}
							</div>
						))
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Freigabelink</CardTitle>
					<CardDescription>
						Erzeuge einen schreibgeschützten Link für Stakeholder ohne Login.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ShareLink
						token={shareInfo?.token}
						expiresAt={shareInfo?.expiresAt}
						onCreate={handleCreateShare}
						isCreating={isCreatingShare}
					/>
				</CardContent>
			</Card>

			<footer className="hidden print:flex print:fixed print:bottom-4 print:left-0 print:right-0 print:justify-center text-xs text-muted-foreground">
				<span>
					{projectMeta?.name ?? "Projekt"} · Exportiert am {formatDate(Date.now())}
				</span>
			</footer>
		</ProjectSectionLayout>
	);
}

function isStandardResult(value: unknown): value is StandardResultShape {
	if (!value || typeof value !== "object") {
		return false;
	}
	return (
		"summary" in value &&
		"milestones" in value &&
		Array.isArray((value as StandardResultShape).milestones) &&
		Array.isArray((value as StandardResultShape).requirements) &&
		Array.isArray((value as StandardResultShape).openQuestions) &&
		Array.isArray((value as StandardResultShape).metadata)
	);
}

function isCriteriaResult(
	value: unknown,
): value is { items: CriteriaItem[] } {
	if (!value || typeof value !== "object") {
		return false;
	}
	return Array.isArray((value as { items?: unknown[] }).items);
}

function mapCriteriaStatus(
	status: "gefunden" | "nicht_gefunden" | "teilweise" | "unbekannt" | undefined,
): CriteriaItem["status"] {
	return status ?? "unbekannt";
}

function mapStatusLabel(status: CriteriaItem["status"]) {
	switch (status) {
		case "gefunden":
			return "Gefunden";
		case "nicht_gefunden":
			return "Nicht gefunden";
		case "teilweise":
			return "Teilweise";
		case "unbekannt":
		default:
			return "Nicht bewertet";
	}
}

function statusBadgeClass(status: CriteriaItem["status"]) {
	switch (status) {
		case "gefunden":
			return "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900";
		case "teilweise":
			return "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900";
		case "nicht_gefunden":
			return "rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-900";
		case "unbekannt":
		default:
			return "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground";
	}
}

function formatDate(timestamp: number) {
	return new Date(timestamp).toLocaleDateString("de-CH", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
}

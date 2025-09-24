import { useMemo, useState } from "react";

import { Link, createFileRoute } from "@tanstack/react-router";
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
import { ShareLink } from "@/components/share-link";
import { PdfExportButton } from "@/components/pdf-export-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
	const project = useQuery(api.projects.get, { projectId: projectId as any });
	const standard = useQuery(api.analysis.getLatest, {
		projectId: projectId as any,
		type: "standard",
	});
	const criteria = useQuery(api.analysis.getLatest, {
		projectId: projectId as any,
		type: "criteria",
	});

	const createShare = useMutation(api.shares.create);
	const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
	const [isCreatingShare, setCreatingShare] = useState(false);

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

	return (
		<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 print:bg-white">
			<Card>
				<CardHeader className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle>Exportansicht</CardTitle>
						<CardDescription>
							Kombinierter Bericht für Standard- und Kriterien-Analyse. Zum Export auf „Als PDF exportieren“ klicken.
						</CardDescription>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Link
							to="/projekte/$id/standard"
							params={{ id: projectId }}
							className="rounded-md border px-3 py-1 text-sm"
						>
							Standard
						</Link>
						<Link
							to="/projekte/$id/kriterien"
							params={{ id: projectId }}
							className="rounded-md border px-3 py-1 text-sm"
						>
							Kriterien
						</Link>
						<Link
							to="/projekte/$id/dokumente"
							params={{ id: projectId }}
							className="rounded-md border px-3 py-1 text-sm"
						>
							Dokumente
						</Link>
						<Link
							to="/projekte/$id/kommentare"
							params={{ id: projectId }}
							className="rounded-md border px-3 py-1 text-sm"
						>
							Kommentare
						</Link>
						<PdfExportButton disabled={isLoading} />
					</div>
				</CardHeader>
				{projectMeta ? (
					<CardContent className="text-sm text-muted-foreground">
						<p className="font-medium text-foreground">{projectMeta.name}</p>
						<p>
							Kunde/Behörde: {projectMeta.customer}
							{projectMeta.tags.length > 0 ? ` · Tags: ${projectMeta.tags.join(", ")}` : ""}
						</p>
					</CardContent>
				) : null}
			</Card>

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
		</div>
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

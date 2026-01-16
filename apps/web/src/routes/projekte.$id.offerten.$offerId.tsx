import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@tendera/backend/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnalysisEmptyState } from "@/components/analysis-empty-state";
import { AuthStateNotice } from "@/components/auth-state-notice";
import { ProjectSectionLayout } from "@/components/project-section-layout";
import { useOrgAuth } from "@/hooks/useOrgAuth";
import { CriteriaDetail, CriteriaList } from "@/components/criteria-panel";
import type { CriteriaDetailData, CriteriaListItem } from "@/components/criteria-panel";
import type { Citation } from "@/types/citation";
import type { Id } from "@tendera/backend/convex/_generated/dataModel";

type OfferMetric = typeof api.offers.computeMetrics._returnType extends Array<infer T>
	? T
	: never;

export const Route = createFileRoute("/projekte/$id/offerten/$offerId")({
	component: OfferDetailPage,
});

function OfferDetailPage() {
	const { id: projectId, offerId } = Route.useParams();
	const auth = useOrgAuth();
	const checkOffer = useAction(api.analysis.checkOfferAgainstCriteria);
	const [isChecking, setChecking] = useState(false);

	const project = useQuery(
		api.projects.get,
		auth.authReady ? { projectId: projectId as Id<"projects"> } : "skip",
	);

	const offer = useQuery(
		api.offers.get,
		auth.authReady ? { offerId: offerId as Id<"offers"> } : "skip",
	);

	const results = useQuery(
		api.offerCriteria.getByOffer,
		auth.authReady ? { offerId: offerId as Id<"offers"> } : "skip",
	) as OfferCriterionResultRecord[] | undefined;

	const metrics: OfferMetric[] | undefined = useQuery(
		api.offers.computeMetrics,
		auth.authReady ? { projectId: projectId as Id<"projects"> } : "skip",
	);

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

	const metric = metrics?.find((m) => m.offerId === offerId);
	const erfuellungsGrad = metric?.erfuellungsGrad ?? 0;
	const hasDocument = Boolean(offer?.documentId);

	const sortedResults = useMemo(() => {
		const items = (results ?? []) as OfferCriterionResult[];
		return [...items].sort((a, b) => {
			if (a.required !== b.required) {
				return a.required ? -1 : 1;
			}
			return (b.weight ?? 0) - (a.weight ?? 0);
		});
	}, [results]);

	const listItems = useMemo<CriteriaListItem[]>(
		() =>
			sortedResults.map((item) => ({
				criterionId: item.criterionKey,
				title: item.criterionTitle,
				status: mapStatusForBoard(item.status),
			})),
		[sortedResults],
	);

	const [selectedId, setSelectedId] = useState<string | undefined>(listItems[0]?.criterionId);

	useEffect(() => {
		if (listItems.length === 0) {
			setSelectedId(undefined);
			return;
		}
		if (!selectedId || !listItems.some((item) => item.criterionId === selectedId)) {
			setSelectedId(listItems[0]?.criterionId);
		}
	}, [listItems, selectedId]);

	const activeResult = useMemo<OfferCriterionResult | undefined>(() => {
		if (sortedResults.length === 0) {
			return undefined;
		}
		if (!selectedId) {
			return sortedResults[0];
		}
		return sortedResults.find((item) => item.criterionKey === selectedId) ?? sortedResults[0];
	}, [selectedId, sortedResults]);

	const activeCriterion = useMemo<CriteriaDetailData | undefined>(() => {
		if (!activeResult) {
			return undefined;
		}
		return {
			criterionId: activeResult.criterionKey,
			title: activeResult.criterionTitle,
			hints: activeResult.required ? "Muss-Kriterium" : "Kann-Kriterium",
			sourcePages: activeResult.citations?.map((citation) => citation.page) ?? [],
			status: mapStatusForBoard(activeResult.status),
			comment: activeResult.comment ?? undefined,
			answer: undefined,
			score:
				typeof activeResult.confidence === "number" ? Math.round(activeResult.confidence) : undefined,
			weight: typeof activeResult.weight === "number" ? activeResult.weight : undefined,
			citations:
				activeResult.citations?.map((citation) => ({
					...citation,
				})) ?? [],
		};
	}, [activeResult]);

	const statusBreakdown = useMemo(() => {
		return sortedResults.reduce(
			(acc, item) => {
				acc[item.status] = (acc[item.status] ?? 0) + 1;
				return acc;
			},
			{ erfuellt: 0, teilweise: 0, nicht_erfuellt: 0, unklar: 0 } as Record<OfferStatus, number>,
		);
	}, [sortedResults]);

	const handleCheck = async () => {
		if (!hasDocument) {
			toast.error("Bitte zuerst ein Angebotsdokument hochladen.");
			return;
		}
		setChecking(true);
		try {
			await checkOffer({
				projectId: projectId as Id<"projects">,
				offerId: offerId as Id<"offers">,
			});
			toast.success("Prüfung gestartet.");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Prüfung fehlgeschlagen.");
		} finally {
			setChecking(false);
		}
	};

	return (
		<ProjectSectionLayout
			projectId={projectId}
			projectName={project?.project.name}
			customer={project?.project.customer ?? null}
			projectType={project?.project.projectType}
			section={{
				id: "offer-detail",
				title: offer?.anbieterName ?? "Angebot",
				description: `Detaillierte Kriterien-Prüfung · Erfüllungsgrad: ${erfuellungsGrad}%`,
			}}
		>
			<div className="space-y-6">
				{metric && (
					<Card>
						<CardHeader>
							<CardTitle>Übersicht</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="grid gap-4 md:grid-cols-2">
								<div className="rounded-md border p-4">
									<p className="text-sm text-muted-foreground">Erfüllungsgrad</p>
									<p className="text-3xl font-bold">{erfuellungsGrad}%</p>
								</div>
								<div className="rounded-md border p-4">
									<p className="text-sm text-muted-foreground">Geprüfte Kriterien</p>
									<p className="text-3xl font-bold">{metric.totalCriteria}</p>
								</div>
							</div>
							<div className="grid grid-cols-4 gap-4 text-center">
								<div>
									<p className="text-2xl font-bold text-green-600">{metric.erfuellt}</p>
									<p className="text-xs text-muted-foreground">Erfüllt</p>
								</div>
								<div>
									<p className="text-2xl font-bold text-amber-600">{metric.teilweise}</p>
									<p className="text-xs text-muted-foreground">Teilweise</p>
								</div>
								<div>
									<p className="text-2xl font-bold text-red-600">{metric.nichtErfuellt}</p>
									<p className="text-xs text-muted-foreground">Nicht erfüllt</p>
								</div>
								<div>
									<p className="text-2xl font-bold text-gray-400">{metric.unklar}</p>
									<p className="text-xs text-muted-foreground">Unklar</p>
								</div>
							</div>
						</CardContent>
					</Card>
				)}

				{!hasDocument && (
					<Card>
						<CardContent className="py-6">
							<AnalysisEmptyState
								title="Angebotsdokument fehlt"
								description="Lade das Angebotsdokument hoch, damit die Kriterienprüfung starten kann."
								action={
									<Button size="sm" asChild>
										<Link to="/projekte/$id/offerten/setup" params={{ id: projectId }} preload="intent">
											Dokument hochladen
										</Link>
									</Button>
								}
							/>
						</CardContent>
					</Card>
				)}

				{sortedResults.length === 0 ? (
					<Card>
						<CardContent className="py-6">
							<AnalysisEmptyState
								title="Noch keine Ergebnisse"
								description="Starte die Prüfung, um die Kriterienauswertung zu sehen."
								action={
									<Button size="sm" onClick={handleCheck} disabled={isChecking || !hasDocument}>
										{isChecking ? "Prüft ..." : "Prüfung starten"}
									</Button>
								}
							/>
						</CardContent>
					</Card>
				) : (
					<Card>
						<CardHeader>
							<CardTitle>Kriterienbewertung</CardTitle>
							<CardDescription>
								Muss-Kriterien zuerst, danach nach Gewichtung sortiert.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-5">
							<div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
								<StatusPill label="Erfüllt" tone="success" value={statusBreakdown.erfuellt} />
								<StatusPill label="Teilweise" tone="warn" value={statusBreakdown.teilweise} />
								<StatusPill label="Nicht erfüllt" tone="error" value={statusBreakdown.nicht_erfuellt} />
								<StatusPill label="Unklar" tone="muted" value={statusBreakdown.unklar} />
							</div>
							<div className="grid gap-6 lg:grid-cols-[320px_1fr]">
								<div className="lg:sticky lg:top-28">
									<CriteriaList items={listItems} selectedId={selectedId} onSelect={setSelectedId} />
								</div>
								<CriteriaDetail criterion={activeCriterion} />
							</div>
						</CardContent>
					</Card>
				)}
			</div>
		</ProjectSectionLayout>
	);
}

type OfferStatus = "erfuellt" | "teilweise" | "nicht_erfuellt" | "unklar";

type OfferCriterionResult = {
	criterionKey: string;
	criterionTitle: string;
	required: boolean;
	status: OfferStatus;
	comment?: string | null;
	weight?: number | null;
	citations?: Citation[];
	confidence?: number | null;
};

type OfferCriterionResultRecord = OfferCriterionResult & {
	_id: string;
	offerId: string;
	projectId: string;
	runId: string;
};

function mapStatusForBoard(status: OfferStatus): CriteriaDetailData["status"] {
	switch (status) {
		case "erfuellt":
			return "gefunden";
		case "teilweise":
			return "teilweise";
		case "nicht_erfuellt":
			return "nicht_gefunden";
		case "unklar":
		default:
			return "unbekannt";
	}
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

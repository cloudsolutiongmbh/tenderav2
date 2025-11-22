import { useMemo } from "react";

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { api } from "@tendera/backend/convex/_generated/api";
import {
	MetadataCard,
	MilestonesCard,
	RequirementsCard,
	SummaryCard,
} from "@/components/analysis-cards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CitationList } from "@/components/citation-list";
import type { Citation } from "@/types/citation";

interface StandardResultShape {
	summary: string | null;
	milestones: Array<{ title: string; date?: string; citation?: Citation }>;
	requirements: Array<{ title: string; category?: string; notes?: string; citation?: Citation }>;
	metadata: Array<{ label: string; value: string; citation?: Citation }>;
}

interface CriteriaItem {
	criterionId: string;
	title: string;
	status: "gefunden" | "nicht_gefunden" | "teilweise" | "unbekannt";
	comment?: string;
	answer?: string;
	citations: Citation[];
}

export const Route = createFileRoute("/share/$token")({
	component: SharePage,
});

function SharePage() {
	const { token } = Route.useParams();
	const shareData = useQuery(api.shares.resolve, { token });
	const isLoading = shareData === undefined;

	const standardResult = useMemo<StandardResultShape | null>(() => {
		const result = shareData?.standardResult?.result;
		if (isStandardResult(result)) {
			return result;
		}
		return null;
	}, [shareData]);

	const criteriaItems = useMemo<CriteriaItem[]>(() => {
		const result = shareData?.criteriaResult?.result;
		if (isCriteriaResult(result)) {
			return result.items.map((item) => ({
				...item,
				status: item.status ?? "unbekannt",
				citations: item.citations ?? [],
			}));
		}
		return [];
	}, [shareData]);

	if (isLoading) {
		return (
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
				<Card>
					<CardContent className="py-6 text-sm text-muted-foreground">Lade Freigabelink …</CardContent>
				</Card>
			</div>
		);
	}

	if (!shareData) {
		return (
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
				<Card>
					<CardHeader>
						<CardTitle>Link ungültig</CardTitle>
						<CardDescription>
							Der angeforderte Freigabelink ist abgelaufen oder existiert nicht mehr.
						</CardDescription>
					</CardHeader>
				</Card>
			</div>
		);
	}

	const project = shareData.project;

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
			<Card>
				<CardHeader>
					<CardTitle>Analyse-Ergebnisse</CardTitle>
					<CardDescription>
						Schreibgeschützte Ansicht für {project.name} – erstellt mit Token {token}.
					</CardDescription>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground">
					<p className="font-medium text-foreground">{project.name}</p>
					<p>{project.customer}</p>
					{project.tags.length > 0 ? (
						<p>Tags: {project.tags.join(", ")}</p>
					) : null}
					<p>
						Gültig bis: {shareData.share.expiresAt ? formatDateTime(shareData.share.expiresAt) : "–"}
					</p>
				</CardContent>
			</Card>

			<section className="space-y-6">
				<SummaryCard
					summary={standardResult?.summary ?? "Für dieses Projekt liegt noch keine Standard-Analyse vor."}
					isLoading={false}
				/>
				<div className="grid gap-6 lg:grid-cols-2">
					<MilestonesCard milestones={standardResult?.milestones ?? []} />
					<MetadataCard metadata={standardResult?.metadata ?? []} />
				</div>
				<RequirementsCard requirements={standardResult?.requirements ?? []} />
			</section>

			<Card>
				<CardHeader>
					<CardTitle>Kriterien</CardTitle>
					<CardDescription>
						Status und Fundstellen aus der Kriterien-Analyse.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{criteriaItems.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							Keine Kriterien-Ergebnisse vorhanden.
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
									<div className="mt-3">
										<CitationList citations={item.citations} />
									</div>
								) : null}
							</div>
						))
					)}
				</CardContent>
			</Card>
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

function mapStatusLabel(status: CriteriaItem["status"]) {
	switch (status) {
		case "gefunden":
			return "Gefunden";
		case "teilweise":
			return "Teilweise";
		case "nicht_gefunden":
			return "Nicht gefunden";
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

function formatDateTime(timestamp: number) {
	return new Date(timestamp).toLocaleString("de-CH", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

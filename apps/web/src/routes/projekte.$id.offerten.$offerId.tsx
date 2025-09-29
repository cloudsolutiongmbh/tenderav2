import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { api } from "@tendera/backend/convex/_generated/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthStateNotice } from "@/components/auth-state-notice";
import { ProjectSectionLayout } from "@/components/project-section-layout";
import { useOrgAuth } from "@/hooks/useOrgAuth";

export const Route = createFileRoute("/projekte/$id/offerten/$offerId")({
	component: OfferDetailPage,
});

function OfferDetailPage() {
	const { id: projectId, offerId } = Route.useParams();
	const auth = useOrgAuth();

	const project = useQuery(
		api.projects.get,
		auth.authReady ? { projectId: projectId as any } : "skip",
	);

	const offer = useQuery(
		api.offers.get,
		auth.authReady ? { offerId: offerId as any } : "skip",
	);

	const results = useQuery(
		api.offerCriteria.getByOffer,
		auth.authReady ? { offerId: offerId as any } : "skip",
	);

	const metrics = useQuery(
		api.offers.computeMetrics,
		auth.authReady ? { projectId: projectId as any } : "skip",
	);

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

	const metric = metrics?.find((m) => m.offerId === offerId);
	const erfuellungsGrad = metric?.erfuellungsGrad ?? 0;

	const mussCriteria = results?.filter((r) => r.required) ?? [];
	const kannCriteria = results?.filter((r) => !r.required) ?? [];

	return (
		<ProjectSectionLayout
			projectId={projectId}
			projectName={project?.project.name}
			customer={project?.project.customer ?? null}
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

				{mussCriteria.length > 0 && (
					<Card>
						<CardHeader>
							<CardTitle>Muss-Kriterien</CardTitle>
							<CardDescription>
								Obligatorische Anforderungen, die erfüllt sein müssen
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{mussCriteria.map((result) => (
								<CriterionResultItem key={result.criterionKey} result={result} />
							))}
						</CardContent>
					</Card>
				)}

				{kannCriteria.length > 0 && (
					<Card>
						<CardHeader>
							<CardTitle>Kann-Kriterien</CardTitle>
							<CardDescription>
								Optionale oder wünschenswerte Anforderungen
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{kannCriteria.map((result) => (
								<CriterionResultItem key={result.criterionKey} result={result} />
							))}
						</CardContent>
					</Card>
				)}

				{results && results.length === 0 && (
					<Card>
						<CardContent className="py-8 text-center text-sm text-muted-foreground">
							Noch keine Ergebnisse verfügbar. Starte die Prüfung im Offerten-Vergleich.
						</CardContent>
					</Card>
				)}
			</div>
		</ProjectSectionLayout>
	);
}

interface CriterionResultItemProps {
	result: any;
}

function CriterionResultItem({ result }: CriterionResultItemProps) {
	const statusConfig = {
		erfuellt: {
			label: "Erfüllt",
			className: "bg-green-100 text-green-900 border-green-200",
		},
		nicht_erfuellt: {
			label: "Nicht erfüllt",
			className: "bg-red-100 text-red-900 border-red-200",
		},
		teilweise: {
			label: "Teilweise",
			className: "bg-amber-100 text-amber-900 border-amber-200",
		},
		unklar: {
			label: "Unklar",
			className: "bg-gray-100 text-gray-900 border-gray-200",
		},
	};

	const config = statusConfig[result.status as keyof typeof statusConfig] ?? statusConfig.unklar;

	return (
		<div className="rounded-lg border p-4 space-y-3">
			<div className="flex items-start justify-between gap-3">
				<div className="flex-1">
					<h3 className="font-semibold">{result.criterionTitle}</h3>
				</div>
				<span
					className={`rounded-full px-3 py-1 text-xs font-medium ${config.className}`}
				>
					{config.label}
				</span>
			</div>

			{result.comment && (
				<div className="rounded-md bg-muted p-3">
					<p className="text-sm">{result.comment}</p>
				</div>
			)}

			{result.confidence !== null && result.confidence !== undefined && (
				<div className="text-sm text-muted-foreground">
					Konfidenz: {result.confidence}%
				</div>
			)}

			{result.citations && result.citations.length > 0 && (
				<div className="space-y-2">
					<p className="text-sm font-medium">Fundstellen:</p>
					<ul className="space-y-1">
						{result.citations.map((citation: any, index: number) => (
							<li
								key={`${citation.page}-${index}`}
								className="text-sm text-muted-foreground"
							>
								<span className="font-medium">Seite {citation.page}:</span> „
								{citation.quote}"
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Circle, CircleDot } from "lucide-react";

import { api } from "@tendera/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { AuthStateNotice } from "@/components/auth-state-notice";
import { ProjectSectionLayout } from "@/components/project-section-layout";
import { useOrgAuth } from "@/hooks/useOrgAuth";
import type { Doc, Id } from "@tendera/backend/convex/_generated/dataModel";

type OfferMetric = typeof api.offers.computeMetrics._returnType extends Array<infer T>
	? T
	: never;

type OfferStatus = Doc<"offerCriteriaResults">["status"];

type OfferComparison = {
	criteria: Array<{
		key: string;
		title: string;
		required: boolean;
		weight: number;
	}>;
	offers: Array<{
		_id: Id<"offers">;
		anbieterName: string;
		latestStatus?: Doc<"offers">["latestStatus"];
	}>;
	matrix: Record<string, Record<string, { status: OfferStatus }>>;
};

export const Route = createFileRoute("/projekte/$id/offerten/")({
	component: OffertenIndexPage,
});

function OffertenIndexPage() {
	const { id: projectId } = Route.useParams();
	const auth = useOrgAuth();

	const project = useQuery(
		api.projects.get,
		auth.authReady ? { projectId: projectId as Id<"projects"> } : "skip",
	);

	const offers: Doc<"offers">[] | undefined = useQuery(
		api.offers.list,
		auth.authReady ? { projectId: projectId as Id<"projects"> } : "skip",
	);

	const documents: Doc<"documents">[] | undefined = useQuery(
		api.documents.listByProject,
		auth.authReady ? { projectId: projectId as Id<"projects"> } : "skip",
	);

	const metrics: OfferMetric[] | undefined = useQuery(
		api.offers.computeMetrics,
		auth.authReady ? { projectId: projectId as Id<"projects"> } : "skip",
	);

	const comparison: OfferComparison | undefined = useQuery(
		api.offerCriteria.getComparison,
		auth.authReady ? { projectId: projectId as Id<"projects"> } : "skip",
	);

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

	const hasTemplate = Boolean(project?.project.templateId);
	const pflichtenheft = useMemo(() => {
		const docs = documents ?? [];
		const byRole = docs.find((doc) => doc.role === "pflichtenheft");
		if (byRole) {
			return byRole;
		}
		if (docs.length === 1) {
			return docs[0];
		}
		return undefined;
	}, [documents]);
	const offerDocuments = useMemo(
		() => (documents ?? []).filter((doc) => doc.role === "offer"),
		[documents],
	);
	const pflichtenheftExtracted = Boolean(pflichtenheft?.textExtracted);
	const offersCount = offers?.length ?? 0;
	const documentsById = useMemo(() => {
		const map = new Map<Id<"documents">, Doc<"documents">>();
		for (const doc of documents ?? []) {
			map.set(doc._id, doc);
		}
		return map;
	}, [documents]);
	const stepIcons = {
		done: <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />,
		current: <CircleDot className="h-4 w-4 text-primary" aria-hidden />,
		pending: <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />,
	} as const;

	const setupSteps = [
		{
			id: "upload",
			status: pflichtenheft ? "done" : "current",
			title: "Pflichtenheft hochladen",
			description: pflichtenheft
				? `Bereit: ${pflichtenheft.filename}`
				: "Lade das Pflichtenheft hoch oder ziehe es direkt im Setup in die Upload-Zone.",
		},
		{
			id: "extract",
			status: hasTemplate
				? "done"
				: pflichtenheft
					? pflichtenheftExtracted
						? "current"
						: "pending"
					: "pending",
			title: "Kriterien extrahieren",
			description: hasTemplate
				? "Template erstellt."
				: pflichtenheft
					? pflichtenheftExtracted
						? "Starte die Extraktion im Setup, sobald der Upload vollständig ist."
						: "Das Pflichtenheft wird noch verarbeitet."
					: "Aktiviert sich automatisch nach dem Upload.",
		},
		{
			id: "documents",
			status: offerDocuments.length > 0 ? "done" : hasTemplate ? "current" : "pending",
			title: "Angebotsdokumente hochladen",
			description:
				offerDocuments.length > 0
					? `${offerDocuments.length} Dokument${offerDocuments.length === 1 ? "" : "e"} vorbereitet.`
					: hasTemplate
						? "Lade die Angebote im Setup hoch – pro Datei wird ein Angebot angelegt."
						: "Verfügbar nachdem Kriterien extrahiert wurden.",
		},
		{
			id: "offers",
			status: offersCount > 0 ? "done" : offerDocuments.length > 0 ? "current" : "pending",
			title: "Angebote vergleichen",
			description: hasTemplate
				? offersCount > 0
					? `${offersCount} Angebote erfasst.`
					: "Füge nun Angebote hinzu und starte den Vergleich."
				: "Verfügbar nach der Kriterien-Extraktion.",
		},
	] as const;

	return (
		<ProjectSectionLayout
			projectId={projectId}
			projectName={project?.project.name}
			customer={project?.project.customer ?? null}
			section={{
				id: "offerten",
				title: "Offerten-Vergleich",
				description: `${offers?.length ?? 0} Angebote im Vergleich`,
			}}
			actions={
				<Button size="sm" asChild>
					<Link to="/projekte/$id/offerten/setup" params={{ id: projectId }} preload="intent">
						Dokumente hochladen
					</Link>
				</Button>
			}
		>
			<div className="space-y-6">
				{!hasTemplate && (
					<Card className="border-primary/40 bg-primary/5">
						<CardHeader>
							<CardTitle>Setup ausstehend</CardTitle>
							<CardDescription>
								Schliesse die folgenden Schritte ab, um Angebote zu vergleichen.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							{setupSteps.map((step) => (
								<div
									key={step.id}
									className="flex items-start gap-3 rounded-lg border border-border/60 bg-background px-3 py-3"
								>
									<span className="mt-1">{stepIcons[step.status]}</span>
									<div className="space-y-1">
										<p className="text-sm font-medium">{step.title}</p>
										<p className="text-xs text-muted-foreground">{step.description}</p>
									</div>
								</div>
							))}
							<div className="flex flex-wrap gap-2 pt-1">
								<Button size="sm" asChild>
									<Link to="/projekte/$id/offerten/setup" params={{ id: projectId }} preload="intent">
										Setup öffnen
									</Link>
								</Button>
								<Button size="sm" variant="outline" asChild>
									<Link to="/projekte/$id/dokumente" params={{ id: projectId }} preload="intent">
										Dokumente
									</Link>
								</Button>
							</div>
						</CardContent>
					</Card>
				)}

				{offers && offers.length === 0 ? (
					<Card>
						<CardContent className="py-8 text-center text-sm text-muted-foreground">
							Noch keine Angebote verfügbar. Lade Angebotsdokumente im Setup hoch, um automatisch Angebote zu erstellen.
						</CardContent>
					</Card>
				) : (
					<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{offers?.map((offer) => {
						const metric = metrics?.find((m) => m.offerId === offer._id);
						const document = offer.documentId ? documentsById.get(offer.documentId) : undefined;
						return (
							<OfferCard
								key={offer._id}
								offer={offer}
								metric={metric}
								projectId={projectId}
								document={document}
							/>
						);
					})}
					</div>
				)}

				{comparison && comparison.criteria.length > 0 && offers && offers.length > 0 && (
					<Card>
						<CardHeader>
							<CardTitle>Vergleichsmatrix</CardTitle>
							<CardDescription>
								Übersicht aller Kriterien und deren Erfüllung pro Angebot
							</CardDescription>
						</CardHeader>
						<CardContent>
							<ComparisonTable comparison={comparison} />
						</CardContent>
					</Card>
				)}
			</div>
		</ProjectSectionLayout>
	);
}

interface OfferCardProps {
	offer: Doc<"offers">;
	metric?: OfferMetric;
	projectId: string;
	document?: Doc<"documents">;
}

function OfferCard({ offer, metric, projectId, document }: OfferCardProps) {
	const checkOffer = useAction(api.analysis.checkOfferAgainstCriteria);
	const deleteOffer = useMutation(api.offers.remove);
	const progress = useQuery(api.analysis.getOfferCheckProgress, { offerId: offer._id });
	const [isChecking, setChecking] = useState(false);
	const [isDeleting, setDeleting] = useState(false);

	const runStatus = progress?.run?.status ?? null;
	const processedCount = progress?.run?.processedCount ?? 0;
	const failedCount = progress?.run?.failedCount ?? 0;
	const totalCount = progress?.run?.totalCount ?? 0;
	const isRunActive = runStatus === "läuft" || runStatus === "wartet";
	const hasRun = progress?.run != null;
	const badgeStatus = progress?.run?.status ?? offer.latestStatus ?? null;

	const handleCheck = async () => {
		if (!offer.documentId) {
			toast.error("Bitte zuerst ein Dokument hochladen.");
			return;
		}

		setChecking(true);
		try {
			await checkOffer({
				projectId: projectId as Id<"projects">,
				offerId: offer._id,
			});
			toast.success("Prüfung gestartet – Ergebnisse folgen gleich.");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Prüfung fehlgeschlagen.",
			);
		} finally {
			setChecking(false);
		}
	};

	const handleDelete = async () => {
		if (!confirm(`Angebot "${offer.anbieterName}" wirklich löschen?`)) {
			return;
		}

		setDeleting(true);
		try {
			await deleteOffer({ offerId: offer._id });
			toast.success("Angebot gelöscht.");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Angebot konnte nicht gelöscht werden.",
			);
		} finally {
			setDeleting(false);
		}
	};

	const erfuellungsGrad = metric?.erfuellungsGrad ?? 0;

	return (
		<Card className="flex flex-col">
			<CardHeader>
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0 flex-1">
						<CardTitle className="text-lg">{offer.anbieterName}</CardTitle>
						{offer.notes && (
							<CardDescription className="mt-1 text-xs">
								{offer.notes}
							</CardDescription>
						)}
					</div>
					{badgeStatus && <StatusBadge status={badgeStatus} />}
				</div>
			</CardHeader>
		<CardContent className="flex flex-1 flex-col gap-4">
			{metric && (
				<div className="rounded-md bg-muted p-3">
					<div className="flex items-baseline justify-between">
						<span className="text-sm font-medium">Erfüllungsgrad</span>
						<span className="text-2xl font-bold">{erfuellungsGrad}%</span>
					</div>
						<div className="mt-2 flex gap-3 text-xs text-muted-foreground">
							<span>✓ {metric.erfuellt}</span>
							<span>~ {metric.teilweise}</span>
							<span>✗ {metric.nichtErfuellt}</span>
							{metric.unklar > 0 && <span>? {metric.unklar}</span>}
						</div>
					</div>
				)}

				{document ? (
					<p className="text-xs text-muted-foreground">
						Dokument: {document.filename}
					</p>
				) : (
					<p className="text-sm text-muted-foreground">
						Noch kein Dokument hochgeladen.
					</p>
				)}

			{hasRun && totalCount > 0 && (
				<div className="space-y-2 text-xs">
					{isRunActive && (
						<p className="text-muted-foreground">Prüfung läuft …</p>
					)}
					<div className="flex items-center justify-between text-muted-foreground">
						<span>Fortschritt</span>
						<span>
							{processedCount + failedCount}/{totalCount}
						</span>
					</div>
					<div className="h-2 w-full rounded-full bg-muted">
						<div
							className="h-2 rounded-full bg-primary transition-all"
							style={{
								width: `${totalCount > 0 ? Math.min(100, ((processedCount + failedCount) / totalCount) * 100) : 0}%`,
							}}
						/>
					</div>
					{runStatus === "fehler" && failedCount > 0 && (
						<p className="text-destructive">
							{failedCount} Kriterium{failedCount === 1 ? "" : "e"} konnten nicht bewertet werden.
						</p>
					)}
				</div>
			)}

			<div className="mt-auto flex flex-col gap-2">
					<Button
						size="sm"
						variant="outline"
						onClick={handleCheck}
						disabled={!offer.documentId || isChecking || isRunActive}
					>
						{isChecking ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Prüfe ...
							</>
						) : (
							"Prüfung starten"
						)}
					</Button>
					<Link
						to="/projekte/$id/offerten/$offerId"
						params={{ id: projectId, offerId: offer._id }}
					>
						<Button size="sm" variant="outline" className="w-full">
							Details ansehen
						</Button>
					</Link>
					<Button
						size="sm"
						variant="ghost"
						className="text-destructive hover:bg-destructive/10"
						onClick={handleDelete}
						disabled={isDeleting}
					>
						{isDeleting ? "Löscht ..." : "Löschen"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

interface ComparisonTableProps {
	comparison: OfferComparison;
}

function ComparisonTable({ comparison }: ComparisonTableProps) {
	if (!comparison || comparison.criteria.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				Noch keine Ergebnisse verfügbar.
			</p>
		);
	}

	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b">
						<th className="px-4 py-3 text-left font-medium">Kriterium</th>
						{comparison.offers.map((offer) => (
							<th key={offer._id} className="px-4 py-3 text-center font-medium">
								{offer.anbieterName}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{comparison.criteria.map((criterion) => (
						<tr key={criterion.key} className="border-b hover:bg-muted/50">
							<td className="px-4 py-3">
								<div>
									<span className="font-medium">{criterion.title}</span>
									{criterion.required && (
										<span className="ml-2 text-xs text-red-600">Muss</span>
									)}
								</div>
							</td>
							{comparison.offers.map((offer) => {
								const result = comparison.matrix[criterion.key]?.[offer._id];
								return (
									<td key={offer._id} className="px-4 py-3 text-center">
										{result ? (
											<StatusCell status={result.status} />
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function StatusCell({ status }: { status: string }) {
	const config = {
		erfuellt: { label: "✓", className: "text-green-600" },
		nicht_erfuellt: { label: "✗", className: "text-red-600" },
		teilweise: { label: "~", className: "text-amber-600" },
		unklar: { label: "?", className: "text-gray-400" },
	};

	const { label, className } = config[status as keyof typeof config] ?? config.unklar;

	return <span className={`text-lg font-bold ${className}`}>{label}</span>;
}

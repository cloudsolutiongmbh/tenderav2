import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";

import { api } from "@tendera/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { AuthStateNotice } from "@/components/auth-state-notice";
import { ProjectSectionLayout } from "@/components/project-section-layout";
import { useOrgAuth } from "@/hooks/useOrgAuth";

export const Route = createFileRoute("/projekte/$id/offerten/")({
	component: OffertenIndexPage,
});

function OffertenIndexPage() {
	const { id: projectId } = Route.useParams();
	const auth = useOrgAuth();

	const project = useQuery(
		api.projects.get,
		auth.authReady ? { projectId: projectId as any } : "skip",
	);

	const offers = useQuery(
		api.offers.list,
		auth.authReady ? { projectId: projectId as any } : "skip",
	);

	const metrics = useQuery(
		api.offers.computeMetrics,
		auth.authReady ? { projectId: projectId as any } : "skip",
	);

	const comparison = useQuery(
		api.offerCriteria.getComparison,
		auth.authReady ? { projectId: projectId as any } : "skip",
	);

	const [isDialogOpen, setDialogOpen] = useState(false);

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

	const hasTemplate = Boolean(project?.project.templateId);

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
				<Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
					<DialogTrigger asChild>
						<Button size="sm" disabled={!hasTemplate}>
							<Plus className="mr-2 h-4 w-4" />
							Neues Angebot
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Neues Angebot hinzufügen</DialogTitle>
							<DialogDescription>
								Erfasse den Anbieter-Namen. Dokumente können danach hochgeladen werden.
							</DialogDescription>
						</DialogHeader>
						<NewOfferForm
							projectId={projectId}
							onSuccess={() => setDialogOpen(false)}
						/>
					</DialogContent>
				</Dialog>
			}
		>
			<div className="space-y-6">
				{!hasTemplate && (
					<Card className="border-amber-200 bg-amber-50">
						<CardContent className="py-4">
							<p className="text-sm text-amber-900">
								⚠️ Noch kein Template vorhanden. Bitte zuerst das Setup abschließen.
							</p>
							<Link
								to="/projekte/$id/offerten/setup"
								params={{ id: projectId }}
								className="mt-2 inline-block text-sm font-medium text-amber-900 underline"
							>
								Zum Setup
							</Link>
						</CardContent>
					</Card>
				)}

				{offers && offers.length === 0 ? (
					<Card>
						<CardContent className="py-8 text-center text-sm text-muted-foreground">
							Noch keine Angebote hinzugefügt. Klicke auf "Neues Angebot", um zu starten.
						</CardContent>
					</Card>
				) : (
					<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
						{offers?.map((offer) => {
							const metric = metrics?.find((m) => m.offerId === offer._id);
							return (
								<OfferCard
									key={offer._id}
									offer={offer}
									metric={metric}
									projectId={projectId}
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
	offer: any;
	metric?: any;
	projectId: string;
}

function OfferCard({ offer, metric, projectId }: OfferCardProps) {
	const checkOffer = useAction(api.analysis.checkOfferAgainstCriteria);
	const deleteOffer = useMutation(api.offers.remove);
	const [isChecking, setChecking] = useState(false);
	const [isDeleting, setDeleting] = useState(false);

	const handleCheck = async () => {
		if (!offer.documentId) {
			toast.error("Bitte zuerst ein Dokument hochladen.");
			return;
		}

		setChecking(true);
		try {
			await checkOffer({
				projectId: projectId as any,
				offerId: offer._id,
			});
			toast.success("Prüfung abgeschlossen!");
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
					{offer.latestStatus && <StatusBadge status={offer.latestStatus} />}
				</div>
			</CardHeader>
			<CardContent className="flex-1 space-y-4">
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

				{!offer.documentId && (
					<p className="text-sm text-muted-foreground">
						Noch kein Dokument hochgeladen.
					</p>
				)}

				<div className="flex flex-col gap-2">
					<Button
						size="sm"
						variant="outline"
						onClick={handleCheck}
						disabled={!offer.documentId || isChecking}
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

interface NewOfferFormProps {
	projectId: string;
	onSuccess: () => void;
}

function NewOfferForm({ projectId, onSuccess }: NewOfferFormProps) {
	const createOffer = useMutation(api.offers.create);
	const [isSubmitting, setSubmitting] = useState(false);
	const [anbieterName, setAnbieterName] = useState("");
	const [notes, setNotes] = useState("");

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setSubmitting(true);
		try {
			await createOffer({
				projectId: projectId as any,
				anbieterName,
				notes: notes || undefined,
			});

			setAnbieterName("");
			setNotes("");
			toast.success("Angebot hinzugefügt.");
			onSuccess();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Angebot konnte nicht erstellt werden.",
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<form className="grid gap-4" onSubmit={handleSubmit}>
			<Input
				placeholder="Anbieter-Name (z.B. Firma XY AG)"
				value={anbieterName}
				onChange={(event) => setAnbieterName(event.target.value)}
				required
			/>
			<Input
				placeholder="Optionale Notizen"
				value={notes}
				onChange={(event) => setNotes(event.target.value)}
			/>
			<DialogFooter>
				<DialogClose asChild>
					<Button type="button" variant="outline" disabled={isSubmitting}>
						Abbrechen
					</Button>
				</DialogClose>
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? "Speichere …" : "Angebot anlegen"}
				</Button>
			</DialogFooter>
		</form>
	);
}

interface ComparisonTableProps {
	comparison: any;
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
						{comparison.offers.map((offer: any) => (
							<th key={offer._id} className="px-4 py-3 text-center font-medium">
								{offer.anbieterName}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{comparison.criteria.map((criterion: any) => (
						<tr key={criterion.key} className="border-b hover:bg-muted/50">
							<td className="px-4 py-3">
								<div>
									<span className="font-medium">{criterion.title}</span>
									{criterion.required && (
										<span className="ml-2 text-xs text-red-600">Muss</span>
									)}
								</div>
							</td>
							{comparison.offers.map((offer: any) => {
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
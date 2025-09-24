import { useMemo, useState } from "react";

import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@tendera/backend/convex/_generated/api";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	DialogClose,
} from "@/components/ui/dialog";

interface TemplateOption {
	_id: string;
	name: string;
}

interface RunSummary {
	_id: string;
	status: "wartet" | "läuft" | "fertig" | "fehler";
	createdAt: number;
	startedAt?: number;
	finishedAt?: number;
}

interface ListedProject {
	project: {
		_id: string;
		name: string;
		customer: string;
		tags: string[];
		createdAt: number;
	};
	runs?: {
		standard?: RunSummary;
		criteria?: RunSummary;
	};
}

export const Route = createFileRoute("/projekte")({
	component: ProjektePage,
});

function ProjektePage() {
	const [isDialogOpen, setDialogOpen] = useState(false);
	const projects = useQuery(api.projects.list, { filter: undefined }) as ListedProject[] | undefined;
	const templates = useQuery(api.templates.list) as TemplateOption[] | undefined;

	const templateOptions = useMemo(() => templates ?? [], [templates]);

	return (
		<div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-6 px-4 py-10">
			<Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
				<header className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h1 className="text-3xl font-semibold">Projekte</h1>
						<p className="text-muted-foreground">
							Verwalte Ausschreibungen, lade Unterlagen hoch und starte Analysen.
						</p>
					</div>
					<DialogTrigger asChild>
						<Button>Neues Projekt</Button>
					</DialogTrigger>
				</header>

				<DialogContent>
					<DialogHeader>
						<DialogTitle>Neues Projekt anlegen</DialogTitle>
						<DialogDescription>
							Erfasse die Stammdaten. Dokumente und Analysen folgen im jeweiligen Projekt.
						</DialogDescription>
					</DialogHeader>
					<NewProjectForm
						templates={templateOptions}
						onSuccess={() => setDialogOpen(false)}
					/>
				</DialogContent>
			</Dialog>

			<section className="grid gap-4">
				{projects === undefined ? (
					<ProjectSkeleton />
				) : projects.length === 0 ? (
					<Card>
						<CardContent className="py-8 text-center text-sm text-muted-foreground">
							Noch keine Projekte vorhanden. Lege ein Projekt an, um zu starten.
						</CardContent>
					</Card>
				) : (
					projects.map(({ project, runs }) => {
						const latestRun = getLatestRun(runs);
						const latestStatus = latestRun?.status ?? "wartet";
						const latestType = getRunLabel(runs, latestRun?._id);
						const updatedAt = formatDate(
							getLastActivity(project.createdAt, runs),
						);
						const tagLine = project.tags.length > 0 ? project.tags.join(", ") : "Keine Tags";

						return (
							<Card key={project._id}>
								<CardHeader className="flex flex-wrap items-start justify-between gap-3">
									<div className="space-y-1">
										<CardTitle className="text-lg font-semibold">{project.name}</CardTitle>
										<CardDescription className="space-y-1 text-xs">
											<p>{project.customer}</p>
											<p className="text-muted-foreground">
												{tagLine} · Aktualisiert am {updatedAt}
											</p>
										</CardDescription>
									</div>
									<div className="flex flex-col items-end gap-1 text-right">
										<StatusBadge status={latestStatus} />
										<span className="text-xs text-muted-foreground">{latestType}</span>
									</div>
								</CardHeader>
								<CardContent className="flex flex-wrap gap-3 text-sm">
									<Link
										to="/projekte/$id/standard"
										params={{ id: project._id }}
										className="rounded-md border px-3 py-2 transition-colors hover:bg-muted"
									>
										Standard-Ansicht
									</Link>
									<Link
										to="/projekte/$id/kriterien"
										params={{ id: project._id }}
										className="rounded-md border px-3 py-2 transition-colors hover:bg-muted"
									>
										Kriterien-Ansicht
									</Link>
									<Link
										to="/projekte/$id/dokumente"
										params={{ id: project._id }}
										className="rounded-md border px-3 py-2 transition-colors hover:bg-muted"
									>
										Dokumente
									</Link>
									<Link
										to="/projekte/$id/export"
										params={{ id: project._id }}
										className="rounded-md border px-3 py-2 transition-colors hover:bg-muted"
									>
										Export
									</Link>
								</CardContent>
							</Card>
						);
					})
				)}
			</section>
		</div>
	);
}

interface NewProjectFormProps {
	templates: TemplateOption[];
	onSuccess: () => void;
}

function NewProjectForm({ templates, onSuccess }: NewProjectFormProps) {
	const createProject = useMutation(api.projects.create);
	const [isSubmitting, setSubmitting] = useState(false);
	const [name, setName] = useState("");
	const [customer, setCustomer] = useState("");
	const [tags, setTags] = useState("");
	const [templateId, setTemplateId] = useState<string>("");

	const templateOptions = useMemo(() => templates, [templates]);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setSubmitting(true);
		try {
			const normalizedTags = tags
				.split(",")
				.map((tag) => tag.trim())
				.filter(Boolean);

			await createProject({
				name,
				customer,
				tags: normalizedTags,
				templateId: templateId ? (templateId as any) : undefined,
			});

			setName("");
			setCustomer("");
			setTags("");
			setTemplateId("");
			toast.success("Projekt angelegt.");
			onSuccess();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Projekt konnte nicht erstellt werden.");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<form className="grid gap-4" onSubmit={handleSubmit}>
			<Input
				placeholder="Projektname"
				value={name}
				onChange={(event) => setName(event.target.value)}
				required
			/>
			<Input
				placeholder="Kunde/Behörde"
				value={customer}
				onChange={(event) => setCustomer(event.target.value)}
				required
			/>
			<Input
				placeholder="Interne Tags (Komma-getrennt)"
				value={tags}
				onChange={(event) => setTags(event.target.value)}
			/>
			<select
				className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
				value={templateId}
				onChange={(event) => setTemplateId(event.target.value)}
			>
				<option value="">Optionales Template auswählen</option>
				{templateOptions.map((template) => (
					<option key={template._id} value={template._id}>
						{template.name}
					</option>
				))}
			</select>
			<DialogFooter>
				<DialogClose asChild>
					<Button type="button" variant="outline" disabled={isSubmitting}>
						Abbrechen
					</Button>
				</DialogClose>
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting ? "Speichere …" : "Projekt anlegen"}
				</Button>
			</DialogFooter>
		</form>
	);
}

function ProjectSkeleton() {
	return (
		<Card>
			<CardContent className="space-y-3 p-6">
				<div className="h-5 w-1/2 rounded bg-muted" />
				<div className="h-4 w-3/4 rounded bg-muted" />
				<div className="h-9 w-full rounded bg-muted" />
			</CardContent>
		</Card>
	);
}

function getLatestRun(runs?: ListedProject["runs"] | null) {
	if (!runs) {
		return null;
	}

	const candidates = [runs.standard, runs.criteria].filter(Boolean) as RunSummary[];
	if (candidates.length === 0) {
		return null;
	}

	return candidates.reduce((latest, current) =>
		current.createdAt > latest.createdAt ? current : latest,
	);
}

function getRunLabel(runs: ListedProject["runs"] | undefined, runId?: string) {
	if (!runId || !runs) {
		return "Noch keine Analyse";
	}
	if (runs.standard && runs.standard._id === runId) {
		return "Letzte Analyse: Standard";
	}
	if (runs.criteria && runs.criteria._id === runId) {
		return "Letzte Analyse: Kriterien";
	}
	return "Letzte Analyse";
}

function getLastActivity(createdAt: number, runs?: ListedProject["runs"]) {
	const timestamps = [createdAt];
	if (runs?.standard) {
		timestamps.push(runs.standard.finishedAt ?? runs.standard.startedAt ?? runs.standard.createdAt);
	}
	if (runs?.criteria) {
		timestamps.push(runs.criteria.finishedAt ?? runs.criteria.startedAt ?? runs.criteria.createdAt);
	}
	return Math.max(...timestamps);
}

function formatDate(timestamp: number) {
	return new Date(timestamp).toLocaleDateString("de-CH", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
}

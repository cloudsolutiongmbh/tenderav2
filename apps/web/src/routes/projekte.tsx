import { useMemo, useState } from "react";

import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@tendera/backend/convex/_generated/api";
import { StatusBadge } from "@/components/status-badge";
import { AuthStateNotice } from "@/components/auth-state-notice";
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
import { useOrgAuth } from "@/hooks/useOrgAuth";
import { Grid3x3, List, Trash2, Search } from "lucide-react";

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
	const [viewMode, setViewMode] = useState<"board" | "list">("board");
	const [searchQuery, setSearchQuery] = useState("");
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const isIndex = pathname === "/projekte";
	const auth = useOrgAuth();
	const allProjects = useQuery(
		api.projects.list,
		auth.authReady ? { filter: undefined } : "skip",
	) as ListedProject[] | undefined;
	const templates = useQuery(
		api.templates.list,
		auth.authReady ? undefined : "skip",
	) as TemplateOption[] | undefined;
	const deleteProject = useMutation(api.projects.remove);

	const templateOptions = useMemo(() => templates ?? [], [templates]);

	const projects = useMemo(() => {
		if (!allProjects) return allProjects;
		if (!searchQuery.trim()) return allProjects;

		const query = searchQuery.toLowerCase().trim();
		return allProjects.filter(({ project }) => {
			return (
				project.name.toLowerCase().includes(query) ||
				project.customer.toLowerCase().includes(query) ||
				project.tags.some(tag => tag.toLowerCase().includes(query))
			);
		});
	}, [allProjects, searchQuery]);

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

	if (!isIndex) {
		return <Outlet />;
	}

	const handleDelete = async (projectId: string, projectName: string) => {
		if (!confirm(`Projekt "${projectName}" wirklich löschen? Alle Analysen und Dokumente werden ebenfalls gelöscht.`)) {
			return;
		}
		try {
			await deleteProject({ projectId: projectId as any });
			toast.success("Projekt gelöscht.");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Projekt konnte nicht gelöscht werden.");
		}
	};

	return (
		<div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-6 px-4 py-10">
			<Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
				<header className="space-y-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h1 className="text-3xl font-semibold">Projekte</h1>
							<p className="text-muted-foreground">
								Verwalte Ausschreibungen, lade Unterlagen hoch und starte Analysen.
							</p>
						</div>
						<div className="flex items-center gap-2">
							<div className="flex rounded-md border">
								<Button
									variant={viewMode === "board" ? "default" : "ghost"}
									size="sm"
									onClick={() => setViewMode("board")}
									className="rounded-r-none"
								>
									<Grid3x3 className="h-4 w-4" />
								</Button>
								<Button
									variant={viewMode === "list" ? "default" : "ghost"}
									size="sm"
									onClick={() => setViewMode("list")}
									className="rounded-l-none"
								>
									<List className="h-4 w-4" />
								</Button>
							</div>
							<DialogTrigger asChild>
								<Button>Neues Projekt</Button>
							</DialogTrigger>
						</div>
					</div>
					<div className="relative">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							placeholder="Projekte durchsuchen..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-9"
						/>
					</div>
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

			<section className={viewMode === "board" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "flex flex-col gap-2"}>
				{projects === undefined ? (
					<ProjectSkeleton />
				) : projects.length === 0 ? (
					<Card>
						<CardContent className="py-8 text-center text-sm text-muted-foreground">
							Noch keine Projekte vorhanden. Lege ein Projekt an, um zu starten.
						</CardContent>
					</Card>
				) : viewMode === "board" ? (
					projects.map(({ project, runs }) => {
						const latestRun = getLatestRun(runs);
						const latestStatus = latestRun?.status ?? "wartet";
						const latestType = getRunLabel(runs, latestRun?._id);
						const updatedAt = formatDate(
							getLastActivity(project.createdAt, runs),
						);
						const tagLine = project.tags.length > 0 ? project.tags.join(", ") : "Keine Tags";

						return (
							<Link
								to="/projekte/$id/standard"
								params={{ id: project._id }}
								key={project._id}
								className="block"
							>
								<Card className="group relative cursor-pointer transition-shadow hover:shadow-md">
								<CardHeader className="space-y-3">
									<div className="flex items-start justify-between gap-2">
										<div className="space-y-1 min-w-0 flex-1">
											<CardTitle className="text-lg font-semibold">{project.name}</CardTitle>
											<CardDescription className="space-y-1 text-xs">
												<p>{project.customer}</p>
												<p className="text-muted-foreground">
													{tagLine} · Aktualisiert am {updatedAt}
												</p>
											</CardDescription>
										</div>
										<Button
											variant="ghost"
											size="sm"
											onClick={(e) => {
												e.preventDefault();
												handleDelete(project._id, project.name);
											}}
											className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 flex-shrink-0"
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
									<div className="flex items-center gap-2">
										<StatusBadge status={latestStatus} />
										<span className="text-xs text-muted-foreground">{latestType}</span>
									</div>
								</CardHeader>
								<CardContent className="grid grid-cols-2 gap-2" onClick={(e) => e.preventDefault()}>
									<button
										onClick={(e) => {
											e.preventDefault();
											window.location.href = `/projekte/${project._id}/standard`;
										}}
										className="rounded-md border px-3 py-2 text-sm text-center transition-colors hover:bg-muted"
									>
										Standard-Ansicht
									</button>
									<button
										onClick={(e) => {
											e.preventDefault();
											window.location.href = `/projekte/${project._id}/kriterien`;
										}}
										className="rounded-md border px-3 py-2 text-sm text-center transition-colors hover:bg-muted"
									>
										Kriterien-Ansicht
									</button>
									<button
										onClick={(e) => {
											e.preventDefault();
											window.location.href = `/projekte/${project._id}/dokumente`;
										}}
										className="rounded-md border px-3 py-2 text-sm text-center transition-colors hover:bg-muted"
									>
										Dokumente
									</button>
									<button
										onClick={(e) => {
											e.preventDefault();
											window.location.href = `/projekte/${project._id}/kommentare`;
										}}
										className="rounded-md border px-3 py-2 text-sm text-center transition-colors hover:bg-muted"
									>
										Kommentare
									</button>
									<button
										onClick={(e) => {
											e.preventDefault();
											window.location.href = `/projekte/${project._id}/export`;
										}}
										className="rounded-md border px-3 py-2 text-sm text-center transition-colors hover:bg-muted col-span-2"
									>
										Export
									</button>
								</CardContent>
							</Card>
							</Link>
						);
					})
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
							<Link
								to="/projekte/$id/standard"
								params={{ id: project._id }}
								key={project._id}
								className="block"
							>
								<Card className="group relative cursor-pointer transition-shadow hover:shadow-md">
								<CardHeader className="flex flex-row items-center justify-between py-3">
									<div className="flex flex-1 items-center gap-4">
										<div className="flex-1">
											<CardTitle className="text-base">{project.name}</CardTitle>
											<CardDescription className="text-xs">
												{project.customer} · {tagLine}
											</CardDescription>
										</div>
										<div className="flex flex-col items-end gap-1">
											<StatusBadge status={latestStatus} />
											<span className="text-xs text-muted-foreground">{latestType}</span>
										</div>
										<span className="text-xs text-muted-foreground">
											{updatedAt}
										</span>
										<div className="flex gap-2">
											<button
												onClick={(e) => {
													e.preventDefault();
													window.location.href = `/projekte/${project._id}/standard`;
												}}
												className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
											>
												Standard
											</button>
											<button
												onClick={(e) => {
													e.preventDefault();
													window.location.href = `/projekte/${project._id}/kriterien`;
												}}
												className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
											>
												Kriterien
											</button>
											<button
												onClick={(e) => {
													e.preventDefault();
													window.location.href = `/projekte/${project._id}/dokumente`;
												}}
												className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
											>
												Docs
											</button>
										</div>
										<Button
											variant="ghost"
											size="sm"
											onClick={(e) => {
												e.preventDefault();
												handleDelete(project._id, project.name);
											}}
											className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
								</CardHeader>
							</Card>
							</Link>
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

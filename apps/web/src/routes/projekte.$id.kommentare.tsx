import { useMemo, useState } from "react";

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { Loader2, Trash2 } from "lucide-react";

import { api } from "@tendera/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AuthStateNotice } from "@/components/auth-state-notice";
import { ProjectSectionLayout } from "@/components/project-section-layout";
import { useOrgAuth } from "@/hooks/useOrgAuth";
import type { Id } from "@tendera/backend/convex/_generated/dataModel";

interface MilestoneOption {
	id: string;
	title: string;
}

interface CriterionOption {
	id: string;
	title: string;
}

interface CommentFormState {
	contextType: "general" | "milestone" | "criterion";
	referenceId?: string;
	content: string;
}

export const Route = createFileRoute("/projekte/$id/kommentare")({
	component: ProjectCommentsPage,
});

function ProjectCommentsPage() {
	const { id: projectId } = Route.useParams();
	const navigate = useNavigate();
	const auth = useOrgAuth();
	const project = useQuery(
		api.projects.get,
		auth.authReady ? { projectId: projectId as Id<"projects"> } : "skip",
	);
	const comments = useQuery(
		api.comments.listByProject,
		auth.authReady ? { projectId: projectId as Id<"projects"> } : "skip",
	);
	const standard = useQuery(
		api.analysis.getLatest,
		auth.authReady
			? {
				projectId: projectId as Id<"projects">,
				type: "standard",
			}
			: "skip",
	);
	const criteria = useQuery(
		api.analysis.getLatest,
		auth.authReady
			? {
				projectId: projectId as Id<"projects">,
				type: "criteria",
			}
			: "skip",
	);

	const addComment = useMutation(api.comments.add);
	const removeProject = useMutation(api.projects.remove);

	const milestoneOptions = useMemo<MilestoneOption[]>(() => {
		const result = standard?.result;
		if (!isStandardResult(result)) {
			return [];
		}
		return result.milestones.map((milestone, index) => ({
			id: `milestone-${index}`,
			title: milestone.title,
		}));
	}, [standard]);

	const criterionOptions = useMemo<CriterionOption[]>(() => {
		const result = criteria?.result;
		if (!isCriteriaResult(result)) {
			return [];
		}
		return result.items.map((item) => ({
			id: item.criterionId,
			title: item.title,
		}));
	}, [criteria]);

	const [formState, setFormState] = useState<CommentFormState>({
		contextType: "general",
		content: "",
	});
	const [isSubmitting, setSubmitting] = useState(false);
	const [isDeleting, setDeleting] = useState(false);

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

	const sortedComments = useMemo(() => {
		if (!comments) {
			return [];
		}
		return [...comments].sort((a, b) => b.createdAt - a.createdAt);
	}, [comments]);

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!formState.content.trim()) {
			toast.error("Bitte einen Kommentartext eingeben.");
			return;
		}

		let referenceLabel: string | undefined;
		if (formState.contextType === "milestone") {
			const option = milestoneOptions.find((milestone) => milestone.id === formState.referenceId);
			if (!option) {
				toast.error("Bitte einen Meilenstein auswählen.");
				return;
			}
			referenceLabel = option.title;
		} else if (formState.contextType === "criterion") {
			const option = criterionOptions.find((criterion) => criterion.id === formState.referenceId);
			if (!option) {
				toast.error("Bitte ein Kriterium auswählen.");
				return;
			}
			referenceLabel = option.title;
		}

		setSubmitting(true);
		try {
			await addComment({
				projectId: projectId as Id<"projects">,
				contextType: formState.contextType,
				referenceId: formState.referenceId,
				referenceLabel,
				content: formState.content.trim(),
			});
			toast.success("Kommentar gespeichert.");
			setFormState({ contextType: "general", content: "" });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Kommentar konnte nicht gespeichert werden.");
		} finally {
			setSubmitting(false);
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

	return (
		<ProjectSectionLayout
			projectId={projectId}
			projectName={project?.project.name}
			customer={project?.project.customer ?? null}
			section={{
				id: "kommentare",
				title: "Kommentare",
				description: "Diskussionen zu Meilensteinen oder Kriterien dieses Projekts.",
			}}
			actions={
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
			}
		>
			<Card>
				<CardHeader>
					<CardTitle>Neuen Kommentar erfassen</CardTitle>
					<CardDescription>Verknüpfe den Kommentar optional mit einem Meilenstein oder Kriterium.</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="grid gap-4" onSubmit={handleSubmit}>
						<div className="grid gap-2 sm:grid-cols-2">
							<select
								value={formState.contextType}
								onChange={(event) =>
									setFormState({
										...formState,
										contextType: event.target.value as CommentFormState["contextType"],
										referenceId: undefined,
									})
								}
								className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
							>
								<option value="general">Allgemein</option>
								<option value="milestone">Meilenstein</option>
								<option value="criterion">Kriterium</option>
							</select>
							{formState.contextType === "milestone" ? (
								<select
									value={formState.referenceId ?? ""}
									onChange={(event) =>
										setFormState({ ...formState, referenceId: event.target.value })
									}
									className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
								>
									<option value="">Meilenstein wählen …</option>
									{milestoneOptions.map((milestone) => (
										<option key={milestone.id} value={milestone.id}>
											{milestone.title}
										</option>
									))}
								</select>
							) : formState.contextType === "criterion" ? (
								<select
									value={formState.referenceId ?? ""}
									onChange={(event) =>
										setFormState({ ...formState, referenceId: event.target.value })
									}
									className="h-10 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
								>
									<option value="">Kriterium wählen …</option>
									{criterionOptions.map((criterion) => (
										<option key={criterion.id} value={criterion.id}>
											{criterion.title}
										</option>
									))}
								</select>
							) : (
								<Input value="Kein Bezug" disabled />
							)}
						</div>
 
						<Textarea
							value={formState.content}
							onChange={(event) => setFormState({ ...formState, content: event.target.value })}
							placeholder="Kommentar hinzufügen"
							required
						/>
						<div className="flex justify-end">
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting ? "Speichere …" : "Kommentar speichern"}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Verlauf</CardTitle>
					<CardDescription>Chronologische Liste aller Kommentare.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					{sortedComments.length === 0 ? (
						<p className="text-sm text-muted-foreground">Noch keine Kommentare vorhanden.</p>
					) : (
						sortedComments.map((comment) => (
							<div key={comment._id} className="rounded-lg border border-border/60 p-3 text-sm">
								<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
									<span>
										{mapContextLabel(comment.contextType, comment.referenceLabel)}
									</span>
									<time>{formatDateTime(comment.createdAt)}</time>
								</div>
								<p className="mt-2 text-sm text-foreground">{comment.content}</p>
							</div>
						))
					)}
				</CardContent>
			</Card>
		</ProjectSectionLayout>
	);
}

function isStandardResult(value: unknown): value is {
	milestones: Array<{ title: string }>;
} {
	if (!value || typeof value !== "object") {
		return false;
	}
	return Array.isArray((value as { milestones?: unknown[] }).milestones);
}

function isCriteriaResult(
	value: unknown,
): value is { items: Array<{ criterionId: string; title: string }> } {
	if (!value || typeof value !== "object") {
		return false;
	}
	return Array.isArray((value as { items?: unknown[] }).items);
}

function mapContextLabel(
	contextType: "general" | "milestone" | "criterion",
	referenceLabel?: string | null,
) {
	switch (contextType) {
		case "milestone":
			return `Meilenstein: ${referenceLabel ?? "Unbenannt"}`;
		case "criterion":
			return `Kriterium: ${referenceLabel ?? "Unbenannt"}`;
		case "general":
		default:
			return "Allgemein";
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

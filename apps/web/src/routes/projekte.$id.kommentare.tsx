import { useMemo, useState } from "react";

import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@tendera/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
	const project = useQuery(api.projects.get, { projectId: projectId as any });
	const comments = useQuery(api.comments.listByProject, { projectId: projectId as any });
	const standard = useQuery(api.analysis.getLatest, {
		projectId: projectId as any,
		type: "standard",
	});
	const criteria = useQuery(api.analysis.getLatest, {
		projectId: projectId as any,
		type: "criteria",
	});

	const addComment = useMutation(api.comments.add);

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
				projectId: projectId as any,
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

	return (
		<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
			<Card>
				<CardHeader className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle>Kommentare</CardTitle>
						<CardDescription>
							Diskussionen zu Meilensteinen oder Kriterien dieses Projekts.
						</CardDescription>
					</div>
					<nav className="flex flex-wrap gap-2 text-sm">
						<Link
							to="/projekte/$id/standard"
							params={{ id: projectId }}
							className="rounded-md border px-3 py-1"
						>
							Standard
						</Link>
						<Link
							to="/projekte/$id/kriterien"
							params={{ id: projectId }}
							className="rounded-md border px-3 py-1"
						>
							Kriterien
						</Link>
						<Link
							to="/projekte/$id/dokumente"
							params={{ id: projectId }}
							className="rounded-md border px-3 py-1"
						>
							Dokumente
						</Link>
						<Link
							to="/projekte/$id/kommentare"
							params={{ id: projectId }}
							className="rounded-md bg-primary px-3 py-1 text-primary-foreground"
						>
							Kommentare
						</Link>
						<Link
							to="/projekte/$id/export"
							params={{ id: projectId }}
							className="rounded-md border px-3 py-1"
						>
							Export
						</Link>
					</nav>
				</CardHeader>
			</Card>

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
		</div>
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

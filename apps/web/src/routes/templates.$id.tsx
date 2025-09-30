import { useEffect, useMemo, useState } from "react";

import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { api } from "@tendera/backend/convex/_generated/api";
import { AuthStateNotice } from "@/components/auth-state-notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useOrgAuth } from "@/hooks/useOrgAuth";

interface EditableCriterion {
	localId: string;
	key?: string;
	title: string;
	description: string;
	hints: string;
	answerType: "boolean" | "skala" | "text";
	weight: string;
	required: boolean;
	keywords: string;
	sourcePages: number[];
}

const ANSWER_TYPE_OPTIONS: Array<{ value: EditableCriterion["answerType"]; label: string }>
	= [
		{ value: "boolean", label: "Boolean (Ja/Nein)" },
		{ value: "skala", label: "Skala" },
		{ value: "text", label: "Freitext" },
	];

export const Route = createFileRoute("/templates/$id")({
    component: TemplateDetailPage,
    errorComponent: ({ error }) => (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
            <Card>
                <CardHeader>
                    <CardTitle>Template konnte nicht geladen werden</CardTitle>
                    <CardDescription>
                        {error instanceof Error ? error.message : String(error)}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Link to="/templates" className="rounded-md border px-3 py-2 text-sm">
                        Zurück zur Übersicht
                    </Link>
                </CardContent>
            </Card>
        </div>
    ),
});

function TemplateDetailPage() {
	const { id } = Route.useParams();
	const isNew = id === "neu";
	const navigate = useNavigate();
	const auth = useOrgAuth();

	const template = useQuery(
		api.templates.get,
		auth.authReady && !isNew ? { templateId: id as any } : "skip",
	);

    const upsertTemplate = useMutation(api.templates.upsert);
    const removeTemplate = useMutation(api.templates.remove);

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [language, setLanguage] = useState("Deutsch");
	const [version, setVersion] = useState("1.0");
	const [visibleOrgWide, setVisibleOrgWide] = useState(false);
	const [criteria, setCriteria] = useState<EditableCriterion[]>([createEmptyCriterion()]);
    const [isSaving, setSaving] = useState(false);
    const [isDeleting, setDeleting] = useState(false);

	const isLoading = !isNew && template === undefined;

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

	useEffect(() => {
		if (template) {
			setName(template.name);
			setDescription(template.description ?? "");
			setLanguage(template.language);
			setVersion(template.version);
			setVisibleOrgWide(template.visibleOrgWide);
			setCriteria(
				template.criteria.map((criterion) => ({
					localId: createLocalId(),
					key: criterion.key,
					title: criterion.title,
					description: criterion.description ?? "",
					hints: criterion.hints ?? "",
					answerType: criterion.answerType,
					weight: String(criterion.weight ?? 0),
					required: criterion.required,
					keywords: criterion.keywords?.join(", ") ?? "",
					sourcePages: Array.isArray(criterion.sourcePages) ? criterion.sourcePages : [],
				})),
			);
		} else if (isNew) {
			setCriteria([createEmptyCriterion()]);
		}
	}, [template, isNew]);

    const hasExistingTemplate = useMemo(() => !isNew && template !== undefined && template !== null, [isNew, template]);

    const handleDelete = async () => {
        if (!hasExistingTemplate || !template?._id) return;
        const ok = window.confirm("Dieses Template wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.");
        if (!ok) return;
        setDeleting(true);
        try {
            await removeTemplate({ templateId: template._id as any });
            toast.success("Template gelöscht.");
            navigate({ to: "/templates" });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Template konnte nicht gelöscht werden.");
        } finally {
            setDeleting(false);
        }
    };

	const handleCriterionChange = <T extends keyof EditableCriterion>(
		localId: string,
		field: T,
		value: EditableCriterion[T],
	) => {
		setCriteria((prev) =>
			prev.map((criterion) =>
				criterion.localId === localId
					? {
						...criterion,
						[field]: value,
					}
					: criterion,
			),
		);
	};

	const handleRemoveCriterion = (localId: string) => {
		setCriteria((prev) => (prev.length > 1 ? prev.filter((criterion) => criterion.localId !== localId) : prev));
	};

	const handleAddCriterion = () => {
		setCriteria((prev) => [...prev, createEmptyCriterion()]);
	};

	const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!name.trim()) {
			toast.error("Bitte einen Namen angeben.");
			return;
		}
		if (!language.trim()) {
			toast.error("Bitte eine Sprache angeben.");
			return;
		}
		if (!version.trim()) {
			toast.error("Bitte eine Version angeben.");
			return;
		}
		if (criteria.length === 0) {
			toast.error("Mindestens ein Kriterium hinzufügen.");
			return;
		}

		const normalizedCriteria = criteria.map((criterion, index) => {
			const parsedWeight = Number.parseFloat(criterion.weight || "0");
			const clampedWeight = Number.isNaN(parsedWeight)
				? 0
				: Math.min(100, Math.max(0, parsedWeight));
			const keywordList = criterion.keywords
				.split(",")
				.map((keyword) => keyword.trim())
				.filter(Boolean);

			return {
				key: criterion.key ?? `criterion-${index + 1}`,
				title: criterion.title.trim(),
				description: criterion.description.trim() || undefined,
				hints: criterion.hints.trim() || undefined,
				answerType: criterion.answerType,
				weight: clampedWeight,
				required: criterion.required,
				keywords: keywordList.length > 0 ? keywordList : undefined,
				sourcePages:
					criterion.sourcePages && criterion.sourcePages.length > 0
						? criterion.sourcePages
						: undefined,
			};
		});

		if (normalizedCriteria.some((criterion) => !criterion.title)) {
			toast.error("Jedes Kriterium benötigt einen Titel.");
			return;
		}

		setSaving(true);
		try {
			const templateId = await upsertTemplate({
				templateId: hasExistingTemplate ? (template?._id as any) : undefined,
				name: name.trim(),
				description: description.trim() || undefined,
				language: language.trim(),
				version: version.trim(),
				visibleOrgWide,
				criteria: normalizedCriteria,
			});

			toast.success("Template gespeichert.");
			if (isNew) {
				navigate({ to: "/templates/$id", params: { id: templateId as string } });
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Template konnte nicht gespeichert werden.");
		} finally {
			setSaving(false);
		}
	};

	if (!isNew && template === null) {
		return (
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
				<Card>
					<CardHeader>
						<CardTitle>Template nicht gefunden</CardTitle>
						<CardDescription>Dieses Template existiert nicht oder wurde gelöscht.</CardDescription>
					</CardHeader>
					<CardContent>
						<Link to="/templates" className="rounded-md border px-3 py-2 text-sm">
							Zurück zur Übersicht
						</Link>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
            <Card>
                <CardHeader className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <CardTitle>{isNew ? "Neues Template" : template?.name ?? "Template"}</CardTitle>
                        <CardDescription>
                            Verwalte Name, Sichtbarkeit und Kriterien dieses Templates.
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link to="/templates" className="rounded-md border px-3 py-1 text-sm">
                            Zurück zur Übersicht
                        </Link>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={!hasExistingTemplate || isDeleting}
                        >
                            {isDeleting ? "Lösche …" : "Template löschen"}
                        </Button>
                    </div>
                </CardHeader>
            </Card>

			<form className="space-y-6" onSubmit={handleSave}>
				<Card>
					<CardHeader>
						<CardTitle>Basisdaten</CardTitle>
						<CardDescription>Grundinformationen für den Kriterienkatalog.</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 md:grid-cols-2">
						<Input
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="Name"
							required
							disabled={isLoading}
						/>
						<Input
							value={language}
							onChange={(event) => setLanguage(event.target.value)}
							placeholder="Sprache"
							required
							disabled={isLoading}
						/>
						<Input
							value={version}
							onChange={(event) => setVersion(event.target.value)}
							placeholder="Version"
							required
							disabled={isLoading}
						/>
						<label className="flex items-center gap-2 text-sm text-muted-foreground">
							<Checkbox
								checked={visibleOrgWide}
								onCheckedChange={(checked) =>
									setVisibleOrgWide(checked === true)
								}
								disabled={isLoading}
							/>
							<span>Für gesamte Organisation sichtbar</span>
						</label>
						<Textarea
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							placeholder="Beschreibung"
							className="md:col-span-2"
							disabled={isLoading}
						/>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<CardTitle>Kriterien</CardTitle>
							<CardDescription>
								Definiere Bewertungskriterien inklusive Gewichtung und Hinweise.
							</CardDescription>
						</div>
						<Button type="button" variant="outline" onClick={handleAddCriterion} disabled={isLoading}>
							Kriterium hinzufügen
						</Button>
					</CardHeader>
					<CardContent className="space-y-4">
						{criteria.map((criterion) => (
							<div key={criterion.localId} className="rounded-lg border border-border/60 p-4">
								<div className="grid gap-3 md:grid-cols-2">
									<Input
										value={criterion.title}
										onChange={(event) =>
											handleCriterionChange(criterion.localId, "title", event.target.value)
										}
										placeholder="Titel"
										required
										disabled={isLoading}
									/>
									<Input
										value={criterion.weight}
										onChange={(event) =>
											handleCriterionChange(criterion.localId, "weight", event.target.value)
										}
										type="number"
										min={0}
										max={100}
										step={1}
										placeholder="Gewicht (0–100)"
										disabled={isLoading}
									/>
									<select
										value={criterion.answerType}
										onChange={(event) =>
											handleCriterionChange(
												criterion.localId,
												"answerType",
												event.target.value as EditableCriterion["answerType"],
											)
										}
										className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
										disabled={isLoading}
									>
										{ANSWER_TYPE_OPTIONS.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
									<label className="flex items-center gap-2 text-sm text-muted-foreground">
										<Checkbox
											checked={criterion.required}
											onCheckedChange={(checked) =>
												handleCriterionChange(criterion.localId, "required", checked === true)
											}
											disabled={isLoading}
										/>
										<span>Pflichtkriterium</span>
									</label>
									<Textarea
										value={criterion.description}
										onChange={(event) =>
											handleCriterionChange(criterion.localId, "description", event.target.value)
										}
										placeholder="Beschreibung"
										className="md:col-span-2"
										disabled={isLoading}
									/>
									<Textarea
										value={criterion.hints}
										onChange={(event) =>
											handleCriterionChange(criterion.localId, "hints", event.target.value)
										}
										placeholder="Hinweise / Beispiele"
										className="md:col-span-2"
										disabled={isLoading}
									/>
									<Input
										value={criterion.keywords}
										onChange={(event) =>
											handleCriterionChange(criterion.localId, "keywords", event.target.value)
										}
										placeholder="Keywords (kommagetrennt)"
										className="md:col-span-2"
										disabled={isLoading}
									/>
								</div>
								<div className="mt-3 flex justify-end">
									<Button
										type="button"
										variant="ghost"
										onClick={() => handleRemoveCriterion(criterion.localId)}
										disabled={isLoading || criteria.length === 1}
									>
										Kriterium entfernen
									</Button>
								</div>
							</div>
						))}
					</CardContent>
				</Card>

				<div className="flex justify-end">
					<Button type="submit" disabled={isSaving || isLoading}>
						{isSaving ? "Speichere …" : "Template speichern"}
					</Button>
				</div>
			</form>
		</div>
	);
}

function createEmptyCriterion(): EditableCriterion {
	return {
		localId: createLocalId(),
		title: "",
		description: "",
		hints: "",
		answerType: "boolean",
		weight: "0",
		required: false,
		keywords: "",
		sourcePages: [],
	};
}

function createLocalId() {
	return typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: `criterion-${Math.random().toString(36).slice(2)}`;
}

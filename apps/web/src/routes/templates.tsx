import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { AuthStateNotice } from "@/components/auth-state-notice";

import { api } from "@tendera/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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

interface TemplateSummary {
	_id: string;
	name: string;
	language: string;
	version: string;
	visibleOrgWide: boolean;
	updatedAt?: number;
}

export const Route = createFileRoute("/templates")({
    component: TemplatesPage,
});

function TemplatesPage() {
    const [isDialogOpen, setDialogOpen] = useState(false);
    const [viewMode, setViewMode] = useState<"board" | "list">("board");
    const [searchQuery, setSearchQuery] = useState("");
    const pathname = useRouterState({ select: (s) => s.location.pathname });
    const isIndex = pathname === "/templates";
    const auth = useOrgAuth();
    const allTemplates = useQuery(
        api.templates.list,
        auth.authReady ? undefined : "skip",
    ) as TemplateSummary[] | undefined;
    const isLoading = allTemplates === undefined;
    const deleteTemplate = useMutation(api.templates.remove);

    const templates = React.useMemo(() => {
        if (!allTemplates) return allTemplates;
        if (!searchQuery.trim()) return allTemplates;

        const query = searchQuery.toLowerCase().trim();
        return allTemplates.filter((template) => {
            return (
                template.name.toLowerCase().includes(query) ||
                template.language.toLowerCase().includes(query) ||
                template.version.toLowerCase().includes(query)
            );
        });
    }, [allTemplates, searchQuery]);

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

    if (!isIndex) {
        return <Outlet />;
    }

    const handleDelete = async (templateId: string, templateName: string) => {
        if (!confirm(`Kriterienkatalog "${templateName}" wirklich löschen?`)) {
            return;
        }
        try {
            await deleteTemplate({ templateId: templateId as any });
            toast.success("Kriterienkatalog gelöscht.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Kriterienkatalog konnte nicht gelöscht werden.");
        }
    };

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
            <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
                <header className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h1 className="text-3xl font-semibold">Kriterienkataloge</h1>
                            <p className="text-muted-foreground">
                                Verwalte wiederverwendbare Kriterienkataloge für die Analyse.
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
                                <Button disabled={!auth.authReady}>Neuer Katalog</Button>
                            </DialogTrigger>
                        </div>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Kriterienkataloge durchsuchen..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                </header>

                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Neuen Kriterienkatalog anlegen</DialogTitle>
                        <DialogDescription>
                            Erfasse die Basisdaten. Kriterien kannst du später ergänzen.
                        </DialogDescription>
                    </DialogHeader>
                    <NewTemplateForm onSuccess={() => setDialogOpen(false)} />
                </DialogContent>
            </Dialog>

            <section className={viewMode === "board" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "flex flex-col gap-2"}>
                {isLoading ? (
                    <Card>
                        <CardContent className="py-6 text-sm text-muted-foreground">Lade Kriterienkataloge …</CardContent>
                    </Card>
                ) : (templates?.length ?? 0) === 0 ? (
                    <Card>
                        <CardContent className="py-6 text-sm text-muted-foreground">
                            Noch keine Kriterienkataloge vorhanden. Lege einen neuen Katalog an, um Kriterien zu definieren.
                        </CardContent>
                    </Card>
                ) : viewMode === "board" ? (
                    templates!.map((template) => (
                        <Link
                            to="/templates/$id"
                            params={{ id: template._id }}
                            key={template._id}
                            className="block"
                        >
                            <Card className="group relative cursor-pointer transition-shadow hover:shadow-md">
                            <CardHeader className="space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <CardTitle>{template.name}</CardTitle>
                                        <CardDescription>
                                            Version {template.version} · {template.language} · {template.visibleOrgWide ? "Org-weit sichtbar" : "Privat"}
                                        </CardDescription>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            handleDelete(template._id, template.name);
                                        }}
                                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 flex-shrink-0"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                                {template.updatedAt ? (
                                    <span className="text-xs text-muted-foreground">
                                        Aktualisiert am {formatDate(template.updatedAt)}
                                    </span>
                                ) : null}
                            </CardHeader>
                            <CardContent onClick={(e) => e.preventDefault()}>
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        window.location.href = `/templates/${template._id}`;
                                    }}
                                    className="w-full rounded-md border px-3 py-2 text-sm text-center transition-colors hover:bg-muted"
                                >
                                    Katalog bearbeiten
                                </button>
                            </CardContent>
                        </Card>
                        </Link>
                    ))
                ) : (
                    templates!.map((template) => (
                        <Link
                            to="/templates/$id"
                            params={{ id: template._id }}
                            key={template._id}
                            className="block"
                        >
                            <Card className="group relative cursor-pointer transition-shadow hover:shadow-md">
                            <CardHeader className="flex flex-row items-center justify-between py-3">
                                <div className="flex flex-1 items-center gap-4">
                                    <div className="flex-1">
                                        <CardTitle className="text-base">{template.name}</CardTitle>
                                        <CardDescription className="text-xs">
                                            Version {template.version} · {template.language} · {template.visibleOrgWide ? "Org-weit sichtbar" : "Privat"}
                                        </CardDescription>
                                    </div>
                                    {template.updatedAt ? (
                                        <span className="text-xs text-muted-foreground">
                                            Aktualisiert am {formatDate(template.updatedAt)}
                                        </span>
                                    ) : null}
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            window.location.href = `/templates/${template._id}`;
                                        }}
                                        className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
                                    >
                                        Bearbeiten
                                    </button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            handleDelete(template._id, template.name);
                                        }}
                                        className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardHeader>
                        </Card>
                        </Link>
                    ))
                )}
            </section>
        </div>
    );
}

function formatDate(timestamp: number) {
    return new Date(timestamp).toLocaleDateString("de-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
}

interface NewTemplateFormProps {
    onSuccess: () => void;
}

function NewTemplateForm({ onSuccess }: NewTemplateFormProps) {
    const upsertTemplate = useMutation(api.templates.upsert);
    const [isSubmitting, setSubmitting] = useState(false);
    const [name, setName] = useState("");
    const [language, setLanguage] = useState("Deutsch");
    const [version, setVersion] = useState("1.0");
    const [visibleOrgWide, setVisibleOrgWide] = useState(false);
    const [description, setDescription] = useState("");

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
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

        setSubmitting(true);
        try {
            const templateId = await upsertTemplate({
                templateId: undefined,
                name: name.trim(),
                description: description.trim() || undefined,
                language: language.trim(),
                version: version.trim(),
                visibleOrgWide,
                criteria: [],
            });

            toast.success("Kriterienkatalog angelegt.");
            setName("");
            setLanguage("Deutsch");
            setVersion("1.0");
            setVisibleOrgWide(false);
            setDescription("");
            onSuccess();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Kriterienkatalog konnte nicht erstellt werden.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form className="grid gap-4" onSubmit={handleSubmit}>
            <Input
                placeholder="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
            />
            <Input
                placeholder="Sprache"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                required
            />
            <Input
                placeholder="Version"
                value={version}
                onChange={(event) => setVersion(event.target.value)}
                required
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                    checked={visibleOrgWide}
                    onCheckedChange={(checked) => setVisibleOrgWide(checked === true)}
                />
                <span>Für gesamte Organisation sichtbar</span>
            </label>
            <Textarea
                placeholder="Beschreibung (optional)"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
            />
            <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isSubmitting}>
                        Abbrechen
                    </Button>
                </DialogClose>
                <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Speichere …" : "Katalog anlegen"}
                </Button>
            </DialogFooter>
        </form>
    );
}

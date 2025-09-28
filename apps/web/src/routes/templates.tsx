import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
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
    const pathname = useRouterState({ select: (s) => s.location.pathname });
    const isIndex = pathname === "/templates";
    const auth = useOrgAuth();
    const templates = useQuery(
        api.templates.list,
        auth.authReady ? undefined : "skip",
    ) as TemplateSummary[] | undefined;
    const isLoading = templates === undefined;

	if (auth.orgStatus !== "ready") {
		return <AuthStateNotice status={auth.orgStatus} />;
	}

    if (!isIndex) {
        return <Outlet />;
    }

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
            <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-semibold">Templates</h1>
                        <p className="text-muted-foreground">
                            Verwalte Kriterienkataloge für die Kriterien-Analyse.
                        </p>
                    </div>
                    <DialogTrigger asChild>
                        <Button disabled={!auth.authReady}>Neues Template</Button>
                    </DialogTrigger>
                </header>

                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Neues Template anlegen</DialogTitle>
                        <DialogDescription>
                            Erfasse die Basisdaten. Kriterien kannst du später im Template ergänzen.
                        </DialogDescription>
                    </DialogHeader>
                    <NewTemplateForm onSuccess={() => setDialogOpen(false)} />
                </DialogContent>
            </Dialog>

            <section className="grid gap-4">
                {isLoading ? (
                    <Card>
                        <CardContent className="py-6 text-sm text-muted-foreground">Lade Templates …</CardContent>
                    </Card>
                ) : (templates?.length ?? 0) === 0 ? (
                    <Card>
                        <CardContent className="py-6 text-sm text-muted-foreground">
                            Noch keine Templates vorhanden. Lege ein neues Template an, um Kriterien zu definieren.
                        </CardContent>
                    </Card>
                ) : (
                    templates!.map((template) => (
                        <Card key={template._id}>
                            <CardHeader className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <CardTitle>{template.name}</CardTitle>
                                    <CardDescription>
                                        Version {template.version} · {template.language} · {template.visibleOrgWide ? "Org-weit sichtbar" : "Privat"}
                                    </CardDescription>
                                </div>
                                {template.updatedAt ? (
                                    <span className="text-xs text-muted-foreground">
                                        Aktualisiert am {formatDate(template.updatedAt)}
                                    </span>
                                ) : null}
                            </CardHeader>
                            <CardContent>
                                <Link
                                    to="/templates/$id"
                                    params={{ id: template._id }}
                                    className="rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted"
                                >
                                    Template bearbeiten
                                </Link>
                            </CardContent>
                        </Card>
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

            toast.success("Template angelegt.");
            setName("");
            setLanguage("Deutsch");
            setVersion("1.0");
            setVisibleOrgWide(false);
            setDescription("");
            onSuccess();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Template konnte nicht erstellt werden.");
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
                    {isSubmitting ? "Speichere …" : "Template anlegen"}
                </Button>
            </DialogFooter>
        </form>
    );
}

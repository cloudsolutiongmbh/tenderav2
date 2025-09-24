import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { api } from "@tendera/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
	const navigate = useNavigate();
	const templates = useQuery(api.templates.list) as TemplateSummary[] | undefined;
	const isLoading = templates === undefined;

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-3xl font-semibold">Templates</h1>
					<p className="text-muted-foreground">
						Verwalte Kriterienkataloge für die Kriterien-Analyse.
					</p>
				</div>
				<Button onClick={() => navigate({ to: "/templates/$id", params: { id: "neu" } })}>
					Neues Template
				</Button>
			</header>

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

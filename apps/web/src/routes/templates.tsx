import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, createFileRoute } from "@tanstack/react-router";

const placeholderTemplates = [
	{
		id: "template-1",
		name: "Bauprojekt Standard",
		language: "Deutsch",
		visibleOrgWide: true,
		version: "1.0",
		updatedAt: "2024-01-08",
	},
	{
		id: "template-2",
		name: "IT-Ausschreibung",
		language: "Deutsch",
		visibleOrgWide: false,
		version: "0.4",
		updatedAt: "2023-12-20",
	},
];

export const Route = createFileRoute("/templates")({
	component: TemplatesPage,
});

function TemplatesPage() {
	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-3xl font-semibold">Templates</h1>
					<p className="text-muted-foreground">
						Vorlagen für Kriterienkataloge. Daten sind exemplarisch und werden später dynamisch geladen.
					</p>
				</div>
				<Button disabled>Neues Template</Button>
			</header>

			<section className="grid gap-4">
				{placeholderTemplates.map((template) => (
					<Card key={template.id}>
						<CardHeader className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<CardTitle>{template.name}</CardTitle>
								<CardDescription>
									Version {template.version} · {template.language} · {template.visibleOrgWide ? "Org-weit sichtbar" : "Privat"}
								</CardDescription>
							</div>
							<span className="text-xs text-muted-foreground">
								Aktualisiert am {template.updatedAt}
							</span>
						</CardHeader>
						<CardContent>
							<Link
								to="/templates/$id"
								params={{ id: template.id }}
								className="rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted"
							>
								Template anzeigen
							</Link>
						</CardContent>
					</Card>
				))}
			</section>
		</div>
	);
}

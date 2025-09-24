import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/templates")({
	component: TemplatesPage,
});

function TemplatesPage() {
	return (
		<div className="mx-auto flex h-full max-w-3xl flex-col gap-4 px-4 py-10">
			<h1 className="text-3xl font-semibold">Templates</h1>
			<p className="text-muted-foreground">
				Vorlagenverwaltung folgt in Kürze.
			</p>
		</div>
	);
}

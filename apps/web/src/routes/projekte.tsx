import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projekte")({
	component: ProjektePage,
});

function ProjektePage() {
	return (
		<div className="mx-auto flex h-full max-w-3xl flex-col gap-4 px-4 py-10">
			<h1 className="text-3xl font-semibold">Projekte</h1>
			<p className="text-muted-foreground">
				Hier erscheinen demnächst Ihre Projekte.
			</p>
		</div>
	);
}

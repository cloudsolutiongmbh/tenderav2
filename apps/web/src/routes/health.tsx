import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { api } from "@tendera/backend/convex/_generated/api";

export const Route = createFileRoute("/health")({
	component: HealthPage,
});

function HealthPage() {
	const status = useQuery(api.healthCheck.get);

	return (
		<div className="flex h-full items-center justify-center p-10 text-sm text-muted-foreground">
			{status ?? "Lade Status …"}
		</div>
	);
}

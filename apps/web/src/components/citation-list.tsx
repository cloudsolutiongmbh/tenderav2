import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { Citation } from "@/types/citation";

interface CitationListProps {
	citations: Citation[];
	maxVisible?: number;
	showQuotes?: boolean;
}

export function CitationList({
	citations,
	maxVisible = 2,
	showQuotes = true,
}: CitationListProps) {
	const [expanded, setExpanded] = useState(false);

	if (!citations || citations.length === 0) {
		return null;
	}

	const visible = expanded ? citations : citations.slice(0, maxVisible);
	const remaining = Math.max(0, citations.length - maxVisible);

	return (
		<div className="space-y-2">
			<ul className="space-y-2 text-xs text-muted-foreground">
				{visible.map((citation, index) => (
					<li
						key={`${citation.page}-${index}-${citation.documentName ?? "doc"}`}
						className="rounded-lg border border-border/60 p-2"
					>
						<strong className="font-medium">
							{formatLocation(citation)}
						</strong>
						{showQuotes ? (
							<p className="mt-1 italic">„{citation.quote}“</p>
						) : null}
					</li>
				))}
			</ul>
			{remaining > 0 ? (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="text-xs"
					onClick={() => setExpanded((value) => !value)}
				>
					{expanded
						? "Weniger Quellen anzeigen"
						: `+${remaining} weitere Quellen`}
				</Button>
			) : null}
		</div>
	);
}

function formatLocation(citation: Citation) {
	if (citation.documentName) {
		return `${citation.documentName} · Seite ${citation.page}`;
	}
	if (citation.documentKey) {
		return `Dokument ${citation.documentKey} · Seite ${citation.page}`;
	}
	return `Seite ${citation.page}`;
}

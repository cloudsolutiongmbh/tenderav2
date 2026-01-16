import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AnalysisEmptyState } from "@/components/analysis-empty-state";
import type { Citation } from "@/types/citation";

export interface RequirementItem {
	title: string;
	category?: string;
	notes?: string;
	citation?: Citation;
}

interface RequirementsCardProps {
	requirements?: RequirementItem[];
	isLoading?: boolean;
	title?: string;
	description?: string;
	emptyState?: {
		title: string;
		description: string;
		action?: ReactNode;
	};
}

export function RequirementsCard({
	requirements = [],
	isLoading,
	title = "Anforderungen",
	description = "Wesentliche funktionale und nicht-funktionale Anforderungen.",
	emptyState,
}: RequirementsCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3 text-sm">
				{isLoading ? (
					<LoadingList />
				) : requirements.length > 0 ? (
					<ul className="space-y-3">
						{requirements.map((requirement, index) => (
							<li key={`${requirement.title}-${index}`} className="rounded-lg border border-border/60 p-3">
								<div className="flex items-start justify-between gap-4">
									<div className="font-medium">{requirement.title}</div>
									{requirement.category ? (
										<span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
											{requirement.category}
										</span>
									) : null}
								</div>
								{requirement.notes ? (
									<p className="mt-2 text-muted-foreground">{requirement.notes}</p>
								) : null}
								{requirement.citation ? (
									<p className="mt-2 text-xs text-muted-foreground">
										{formatCitation(requirement.citation)}
									</p>
								) : null}
							</li>
						))}
					</ul>
				) : (
					<AnalysisEmptyState
						title={emptyState?.title ?? "Noch keine Anforderungen"}
						description={
							emptyState?.description ??
							"Führe die Analyse durch, um Anforderungen hier zu sehen."
						}
						action={emptyState?.action}
					/>
				)}
			</CardContent>
		</Card>
	);
}

function LoadingList() {
	return (
		<div className="space-y-3">
			<Skeleton className="h-4 w-full" />
			<Skeleton className="h-4 w-[90%]" />
			<Skeleton className="h-4 w-[75%]" />
		</div>
	);
}

function formatCitation(citation: Citation) {
	const location = citation.documentName
		? `${citation.documentName} · Seite ${citation.page}`
		: `Seite ${citation.page}`;
	return `Zitat (${location}): „${citation.quote}“`;
}

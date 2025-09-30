import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Citation {
	page: number;
	quote: string;
}

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
}

export function RequirementsCard({
	requirements = [],
	isLoading,
	title = "Anforderungen",
	description = "Wesentliche funktionale und nicht-funktionale Anforderungen.",
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
										Zitat (Seite {requirement.citation.page}): „{requirement.citation.quote}“
									</p>
								) : null}
							</li>
						))}
					</ul>
				) : (
					<div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center">
						<p className="text-xs text-muted-foreground">
							Noch keine Anforderungen vorhanden. Starte die Analyse unter "Dokumente".
						</p>
					</div>
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

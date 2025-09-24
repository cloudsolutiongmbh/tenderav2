import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Citation {
	page: number;
	quote: string;
}

export interface MilestoneItem {
	title: string;
	date?: string;
	citation?: Citation;
}

interface MilestonesCardProps {
	milestones?: MilestoneItem[];
	isLoading?: boolean;
}

export function MilestonesCard({ milestones = [], isLoading }: MilestonesCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Meilensteine & Fristen</CardTitle>
				<CardDescription>Wichtige Termine aus der Ausschreibung.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{isLoading ? (
					<div className="space-y-3">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-[80%]" />
						<Skeleton className="h-4 w-[60%]" />
					</div>
				) : milestones.length > 0 ? (
					<ul className="space-y-3 text-sm">
						{milestones.map((milestone, index) => (
							<li key={`${milestone.title}-${index}`} className="border-b border-border/60 pb-3 last:border-0 last:pb-0">
								<div className="flex items-start justify-between gap-4">
									<div className="font-medium">{milestone.title}</div>
									{milestone.date ? (
										<time className="text-xs text-muted-foreground">
											{new Date(milestone.date).toLocaleDateString("de-CH", {
												day: "2-digit",
												month: "2-digit",
												year: "numeric",
											})}
										</time>
									) : null}
								</div>
								{milestone.citation ? (
									<p className="mt-2 text-xs text-muted-foreground">
										Zitat (Seite {milestone.citation.page}): „{milestone.citation.quote}“
									</p>
								) : null}
							</li>
						))}
					</ul>
				) : (
					<p className="text-sm text-muted-foreground">
						Noch keine Meilensteine erfasst.
					</p>
				)}
			</CardContent>
		</Card>
	);
}

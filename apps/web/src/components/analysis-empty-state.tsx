import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AnalysisEmptyStateProps {
	title: string;
	description: string;
	action?: ReactNode;
	className?: string;
}

export function AnalysisEmptyState({
	title,
	description,
	action,
	className,
}: AnalysisEmptyStateProps) {
	return (
		<Card className={cn("border-dashed bg-muted/30", className)}>
			<CardContent className="flex flex-col items-center gap-3 py-6 text-center">
				<div className="space-y-1">
					<p className="text-sm font-medium text-foreground">{title}</p>
					<p className="text-xs text-muted-foreground">{description}</p>
				</div>
				{action ? <div>{action}</div> : null}
			</CardContent>
		</Card>
	);
}

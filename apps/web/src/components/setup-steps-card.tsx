import type { ReactNode } from "react";
import { CheckCircle2, Circle, CircleDot } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type SetupStepStatus = "done" | "current" | "pending";

export interface SetupStepItem {
	id: string;
	status: SetupStepStatus;
	title: string;
	description: string;
}

interface SetupStepsCardProps {
	title: string;
	description?: string;
	steps: ReadonlyArray<SetupStepItem>;
	actions?: ReactNode;
	className?: string;
}

const statusIcons: Record<SetupStepStatus, ReactNode> = {
	done: <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />,
	current: <CircleDot className="h-4 w-4 text-primary" aria-hidden />,
	pending: <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />,
};

export function SetupStepsCard({
	title,
	description,
	steps,
	actions,
	className,
}: SetupStepsCardProps) {
	return (
		<Card className={cn("border-primary/40 bg-primary/5", className)}>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				{description ? <CardDescription>{description}</CardDescription> : null}
			</CardHeader>
			<CardContent className="space-y-3">
				{steps.map((step) => (
					<div
						key={step.id}
						className="flex items-start gap-3 rounded-lg border border-border/60 bg-background px-3 py-3"
					>
						<span className="mt-1">{statusIcons[step.status]}</span>
						<div className="space-y-1">
							<p className="text-sm font-medium">{step.title}</p>
							<p className="text-xs text-muted-foreground">{step.description}</p>
						</div>
					</div>
				))}
				{actions ? <div className="flex flex-wrap gap-2 pt-1">{actions}</div> : null}
			</CardContent>
		</Card>
	);
}

import { type ReactNode } from "react";

import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const projectNavItems = [
	{ id: "standard", label: "Standard", to: "/projekte/$id/standard" },
	{ id: "kriterien", label: "Kriterien", to: "/projekte/$id/kriterien" },
	{ id: "dokumente", label: "Dokumente", to: "/projekte/$id/dokumente" },
	{ id: "kommentare", label: "Kommentare", to: "/projekte/$id/kommentare" },
	{ id: "export", label: "Export", to: "/projekte/$id/export" },
] as const;

type ProjectSectionId = (typeof projectNavItems)[number]["id"];

interface ProjectSectionLayoutProps {
	projectId: string;
	projectName?: string | null;
	customer?: string | null;
	section: {
		id: ProjectSectionId;
		title: string;
		description?: string;
	};
	statusBadge?: ReactNode;
	actions?: ReactNode;
	headerContent?: ReactNode;
	children: ReactNode;
	className?: string;
	contentClassName?: string;
}

export function ProjectSectionLayout({
	projectId,
	projectName,
	customer,
	section,
	statusBadge,
	actions,
	headerContent,
	children,
	className,
	contentClassName,
}: ProjectSectionLayoutProps) {
	return (
		<div className={cn("mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10", className)}>
			<Card className="shadow-sm">
				<CardHeader className="gap-4">
					<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
						<div className="space-y-3">
							<Link
								to="/projekte"
								className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
								preload="intent"
							>
								<ChevronLeft className="h-4 w-4" aria-hidden />
								Zur Projektübersicht
							</Link>
							<div>
								<CardTitle className="text-2xl font-semibold">
									{projectName ?? "Projekt"}
									{customer ? ` · ${customer}` : null}
								</CardTitle>
								{section.description ? (
									<CardDescription className="text-sm text-muted-foreground">
										{section.description}
									</CardDescription>
								) : null}
							</div>
						</div>
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
							{statusBadge}
							{actions}
						</div>
					</div>
					<div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
						<span className="text-sm font-medium text-muted-foreground">
							Bereich:
							<span className="ml-2 text-foreground">{section.title}</span>
						</span>
						<nav className="flex flex-wrap gap-2">
							{projectNavItems.map((item) => {
								const isActive = item.id === section.id;
								return (
									<Link
										key={item.id}
										to={item.to}
										params={{ id: projectId }}
										preload="intent"
										aria-current={isActive ? "page" : undefined}
										className={cn(
											"rounded-full border px-3 py-1 text-sm transition",
											isActive
												? "border-primary bg-primary text-primary-foreground"
												: "border-input bg-background text-muted-foreground hover:text-foreground",
										)}
									>
										{item.label}
									</Link>
								);
							})}
						</nav>
					</div>
				</CardHeader>
				{headerContent ? <CardContent className="text-sm text-muted-foreground">{headerContent}</CardContent> : null}
			</Card>

			<div className={cn("flex flex-col gap-6", contentClassName)}>{children}</div>
		</div>
	);
}

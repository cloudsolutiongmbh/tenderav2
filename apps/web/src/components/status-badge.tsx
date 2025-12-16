import { cn } from "@/lib/utils";

type AnalysisStatus = "wartet" | "läuft" | "fertig" | "fehler";

const STATUS_STYLES: Record<AnalysisStatus, string> = {
	wartet: "bg-amber-100 text-amber-900 border border-amber-200",
	läuft: "bg-sky-100 text-sky-900 border border-sky-200",
	fertig: "bg-emerald-100 text-emerald-900 border border-emerald-200",
	fehler: "bg-rose-100 text-rose-900 border border-rose-200",
};

const STATUS_LABEL: Record<AnalysisStatus, string> = {
	wartet: "Wartet",
	läuft: "Läuft",
	fertig: "Fertig",
	fehler: "Fehler",
};

interface StatusBadgeProps {
	status: AnalysisStatus | null | undefined;
	className?: string;
}

/**
 * Renders a status badge for analysis runs.
 * Returns null if status is null/undefined - this prevents showing a misleading
 * "Wartet" badge during loading or when no analysis has been started.
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
	if (!status) {
		return null;
	}

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium",
				STATUS_STYLES[status],
				className,
			)}
		>
			{STATUS_LABEL[status]}
		</span>
	);
}

export type { AnalysisStatus };

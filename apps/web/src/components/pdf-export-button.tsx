import { Button } from "@/components/ui/button";

interface PdfExportButtonProps {
	label?: string;
	disabled?: boolean;
}

export function PdfExportButton({ label = "Als PDF exportieren", disabled }: PdfExportButtonProps) {
	return (
		<Button
			type="button"
			onClick={() => window.print()}
			disabled={disabled}
		>
			{label}
		</Button>
	);
}

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UploadDropzoneProps {
	maxTotalSizeMb?: number;
	onFilesAccepted?: (files: File[]) => void;
	disabled?: boolean;
	currentTotalBytes?: number;
	maxFiles?: number;
}

const DEFAULT_MAX_TOTAL_MB = 200;

export function UploadDropzone({
	maxTotalSizeMb = DEFAULT_MAX_TOTAL_MB,
	onFilesAccepted,
	disabled = false,
	currentTotalBytes = 0,
	maxFiles,
}: UploadDropzoneProps) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isDragging, setDragging] = useState(false);

	const handleFiles = useCallback(
		(files: FileList | null) => {
			if (!files || disabled) {
				return;
			}

			const fileArray = Array.from(files);
			if (typeof maxFiles === "number" && maxFiles > 0 && fileArray.length > maxFiles) {
				setError(
					maxFiles === 1
						? "Bitte wähle genau eine Datei aus."
						: `Maximal ${maxFiles} Dateien gleichzeitig auswählen.`,
				);
				return;
			}
			const totalBytes = fileArray.reduce((sum, file) => sum + file.size, 0);
			const maxBytes = maxTotalSizeMb * 1024 * 1024;

			if (totalBytes + currentTotalBytes > maxBytes) {
				setError(
					`Limit ${maxTotalSizeMb} MB überschritten. Bereits genutzt: ${formatBytes(currentTotalBytes)} · Auswahl: ${formatBytes(totalBytes)}.`,
				);
				return;
			}

			setError(null);
			onFilesAccepted?.(fileArray);
			if (inputRef.current) {
				inputRef.current.value = "";
			}
		},
		[disabled, maxTotalSizeMb, onFilesAccepted, currentTotalBytes],
	);

	const handleInputChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			handleFiles(event.target.files);
		},
		[handleFiles],
	);

	const openFileDialog = useCallback(() => {
		if (!disabled) {
			inputRef.current?.click();
		}
	}, [disabled]);

	return (
		<div className="space-y-2">
			<div
				onDragOver={(event) => {
					event.preventDefault();
					if (!disabled) {
						setDragging(true);
					}
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={(event) => {
					event.preventDefault();
					setDragging(false);
					handleFiles(event.dataTransfer?.files ?? null);
				}}
				className={cn(
					"border-dashed border-2 rounded-xl px-6 py-10 text-center transition-colors",
					isDragging ? "border-primary bg-primary/10" : "border-muted-foreground/30",
					disabled && "opacity-60 cursor-not-allowed",
				)}
				role="presentation"
			>
				<input
					ref={inputRef}
					type="file"
					multiple={maxFiles === undefined || maxFiles > 1}
					accept=".pdf,.docx,.txt"
					className="hidden"
					onChange={handleInputChange}
				/>
				<p className="text-sm text-muted-foreground">
					Dateien hierher ziehen oder
				</p>
				<Button
					variant="outline"
					size="sm"
					onClick={openFileDialog}
					disabled={disabled}
				>
					Dateien auswählen
				</Button>
				<p className="mt-2 text-xs text-muted-foreground">
					Unterstützt: PDF, DOCX, TXT – Gesamtlimit {maxTotalSizeMb} MB · genutzt {formatBytes(currentTotalBytes)}
				</p>
			</div>
			{error ? (
				<p className="text-sm text-destructive">{error}</p>
			) : null}
		</div>
	);
}

function formatBytes(bytes: number) {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	const kb = bytes / 1024;
	if (kb < 1024) {
		return `${kb.toFixed(1)} KB`;
	}
	const mb = kb / 1024;
	return `${mb.toFixed(1)} MB`;
}

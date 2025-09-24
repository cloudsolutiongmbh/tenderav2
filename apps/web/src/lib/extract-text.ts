import mammoth from "mammoth/mammoth.browser";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker?url";

GlobalWorkerOptions.workerSrc = pdfWorker;

export interface ExtractedPage {
	page: number;
	text: string;
}

export async function extractDocumentPages(file: File): Promise<ExtractedPage[]> {
	const mimeType = file.type || inferMimeType(file.name);

	if (mimeType === "application/pdf") {
		return await extractPdf(file);
	}

	if (
		mimeType ===
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
		file.name.toLowerCase().endsWith(".docx")
	) {
		return await extractDocx(file);
	}

	return await extractPlainText(file);
}

async function extractPdf(file: File): Promise<ExtractedPage[]> {
	const arrayBuffer = await file.arrayBuffer();
	const pdf = await getDocument({ data: arrayBuffer }).promise;
	const pages: ExtractedPage[] = [];

	for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
		const page = await pdf.getPage(pageNumber);
		const textContent = await page.getTextContent();
		const text = textContent.items
			.map((item) => ("str" in item ? item.str : ""))
			.join(" ")
			.replace(/\s+/g, " ")
			.trim();

		pages.push({ page: pageNumber, text });
	}

	return pages;
}

async function extractDocx(file: File): Promise<ExtractedPage[]> {
	const arrayBuffer = await file.arrayBuffer();
	const { value } = await mammoth.extractRawText({ arrayBuffer });
	const cleaned = value.replace(/\r\n/g, "\n").trim();

const blocks = cleaned
		.split(/\n{2,}/)
		.map((block) => block.trim())
		.filter((block): block is string => block.length > 0);

	const pages: ExtractedPage[] = [];
	let currentPage = 1;
	let currentBuffer: string[] = [];
	let charCounter = 0;

	for (const block of blocks) {
		currentBuffer.push(block);
		charCounter += block.length;

		if (charCounter > 1800) {
			pages.push({ page: currentPage, text: currentBuffer.join("\n\n") });
			currentPage += 1;
			currentBuffer = [];
			charCounter = 0;
		}
	}

	if (currentBuffer.length > 0) {
		pages.push({ page: currentPage, text: currentBuffer.join("\n\n") });
	}

	return pages;
}

async function extractPlainText(file: File): Promise<ExtractedPage[]> {
	const text = (await file.text()).trim();
	return [{ page: 1, text }];
}

function inferMimeType(filename: string) {
	const lower = filename.toLowerCase();
	if (lower.endsWith(".pdf")) {
		return "application/pdf";
	}
	if (lower.endsWith(".docx")) {
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
	}
	return "text/plain";
}

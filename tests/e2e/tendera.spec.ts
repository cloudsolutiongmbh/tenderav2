import { expect, test } from "@playwright/test";
import path from "node:path";

let templateId: string;
let projectId: string;
let shareToken: string;
let persistedState: any = null;

const templatePayload = {
	name: "E2E-Vorlage",
	description: "Testvorlage für End-to-End-Flows",
	language: "de",
	version: "1.0",
	visibleOrgWide: true,
	criteria: [
		{
			key: "referenzen",
			title: "Referenzen",
			description: "Mindestens zwei Referenzen",
			hints: "Angaben zu vergleichbaren Projekten",
			answerType: "boolean" as const,
			weight: 50,
			required: true,
			keywords: ["Referenz", "Projekt"],
		},
		{
			key: "iso9001",
			title: "ISO 9001",
			description: "Zertifizierung nach ISO 9001",
			hints: "Aktuelles Zertifikat hochladen",
			answerType: "boolean" as const,
			weight: 50,
			required: false,
			keywords: ["ISO", "9001"],
		},
	],
};

test.describe.serial("Tendera End-to-End", () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript((state) => {
			(window as any).__mockConvexInitialState = state ?? null;
		}, persistedState);
	});

	test.afterEach(async ({ page }) => {
		try {
			persistedState = await page.evaluate(() => window.__mockConvex?.getState?.() ?? null);
		} catch (error) {
			persistedState = persistedState ?? null;
		}
	});

	test("Projekt anlegen, Dateien hochladen und Analysen abschliessen", async ({ page }) => {
		await page.goto("/projekte");
		await page.waitForFunction(() => typeof window !== "undefined" && !!window.__mockConvex);

		if (!persistedState) {
			templateId = await page.evaluate((payload) => window.__mockConvex.seedTemplate(payload), templatePayload);
		} else {
			templateId = await page.evaluate(() => window.__mockConvex.getState().templates[0]._id);
		}

		const projectName = "E2E Projekt Alpha";
		const customer = "Stadt Beispiel";
		const tags = "digital, steuer";

		await page.getByRole("button", { name: "Neues Projekt" }).click();
		await page.getByPlaceholder("Projektname").fill(projectName);
		await page.getByPlaceholder("Kunde/Behörde").fill(customer);
		await page.getByPlaceholder("Interne Tags (Komma-getrennt)").fill(tags);
		await page.getByLabel("Kriterienkatalog (optional)").selectOption(templateId);
		await page.getByRole("button", { name: "Projekt anlegen" }).click();

		await expect(page.getByText("Projekt angelegt.")).toBeVisible();
		await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

		await page.getByRole("button", { name: "Dokumente" }).first().click();
		await expect(page).toHaveURL(/\/projekte\/[^/]+\/dokumente/);
		const currentUrl = new URL(page.url());
		projectId = currentUrl.pathname.split("/")[2];
		await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

		const fixturesDir = path.resolve(process.cwd(), "tests/e2e/fixtures");
		const files = [
			path.join(fixturesDir, "angebot.pdf"),
			path.join(fixturesDir, "kriterien.docx"),
		];

		await page.locator('input[type="file"]').setInputFiles(files);

		await expect(page.getByText("Fertig").first()).toBeVisible();
		const uploadedCard = page
			.getByRole("heading", { name: "Hochgeladene Dateien" })
			.locator('xpath=ancestor::div[@data-slot="card"]');
		await expect(uploadedCard.getByText("angebot.pdf")).toBeVisible();
		await expect(uploadedCard.getByText("kriterien.docx")).toBeVisible();

		const standardCard = page
			.getByRole("heading", { name: "Standard-Analyse" })
			.locator('xpath=ancestor::div[@data-slot="card"][1]');
		await standardCard.getByRole("button", { name: "Analyse starten" }).click();
		await expect(page.getByText("Standard-Analyse gestartet.")).toBeVisible();
		await page.evaluate((id) => window.__mockConvex.completeStandardRun(id), projectId);
		await expect(standardCard.locator("span", { hasText: "Fertig" })).toBeVisible();

		const criteriaCard = page
			.getByRole("heading", { name: "Kriterien-Analyse" })
			.locator('xpath=ancestor::div[@data-slot="card"][1]');
		await criteriaCard.getByRole("button", { name: "Analyse starten" }).click();
		await expect(page.getByText("Kriterien-Analyse gestartet.")).toBeVisible();
		await page.evaluate((id) => window.__mockConvex.completeCriteriaRun(id), projectId);
		await expect(criteriaCard.locator("span", { hasText: "Fertig" })).toBeVisible();
	});

	test("Standard-Ansicht zeigt analysierte Inhalte", async ({ page }) => {
		await page.goto(`/projekte/${projectId}/standard`);
		await page.waitForFunction(() => typeof window !== "undefined" && !!window.__mockConvex);
		await expect(page.getByText("Dieses Test-Ergebnis fasst die wichtigsten Inhalte", { exact: false })).toBeVisible();
		const milestonesCard = page
			.getByRole("heading", { name: "Meilensteine & Fristen" })
			.locator('xpath=ancestor::div[@data-slot="card"][1]');
		await expect(
			milestonesCard
				.getByRole("listitem")
				.filter({ hasText: "Angebotsabgabe" })
				.locator("div.font-medium"),
		).toBeVisible();
		await expect(page.getByText("Sicherheitskonzept", { exact: false })).toBeVisible();
		await expect(page.getByText("Testkommune")).toBeVisible();
		await expect(milestonesCard.getByText(/Zitat \(Seite/).first()).toBeVisible();
	});

	test("Kriterien-Ansicht zeigt Gefunden und Nicht gefunden", async ({ page }) => {
		await page.goto(`/projekte/${projectId}/kriterien`);
		await page.waitForFunction(() => typeof window !== "undefined" && !!window.__mockConvex);
		await expect(page.getByText("Gefunden", { exact: true }).first()).toBeVisible();
		await expect(page.getByText("Nicht gefunden", { exact: false }).first()).toBeVisible();
		await expect(page.getByRole("button", { name: "Referenzen" })).toBeVisible();
		await expect(page.getByRole("button", { name: "ISO 9001" })).toBeVisible();
		await expect(page.getByText(/Seite \d+/, { exact: false }).first()).toBeVisible();
	});

	test("Export und Freigabe funktionieren inklusive Ablauf", async ({ page, context }) => {
		await page.goto(`/projekte/${projectId}/export`);
		await page.waitForFunction(() => typeof window !== "undefined" && !!window.__mockConvex);
		await expect(page.getByRole("button", { name: "Als PDF exportieren" })).toBeVisible();
		await expect(page.getByText(/Seite \d+/, { exact: false }).first()).toBeVisible();

		await page.getByRole("button", { name: "Link erstellen" }).click();
		const linkButton = page.locator("button", { hasText: "/share/" }).first();
		await expect(linkButton).toBeVisible();
		const linkText = (await linkButton.textContent())?.trim() ?? "";
		await expect(linkText.length).toBeGreaterThan(0);
		shareToken = linkText.split("/").pop() ?? "";
		await expect(shareToken.length).toBeGreaterThan(0);

		const shareState = await page.evaluate(() => window.__mockConvex?.getState?.() ?? null);
		const sharePage = await context.newPage();
		await sharePage.addInitScript((state) => {
			(window as any).__mockConvexInitialState = state ?? null;
		}, shareState);
		await sharePage.goto(linkText);
		await expect(sharePage.getByText("Analyse-Ergebnisse")).toBeVisible();
		await expect(sharePage.getByRole("heading", { name: "Referenzen" })).toBeVisible();
		await expect(sharePage.getByRole("button", { name: "Analyse starten" })).toHaveCount(0);

		await sharePage.close();

		await page.evaluate((token) => window.__mockConvex.expireShare(token), shareToken);
		const expiredState = await page.evaluate(() => window.__mockConvex?.getState?.() ?? null);
		const expiredPage = await context.newPage();
		await expiredPage.addInitScript((state) => {
			(window as any).__mockConvexInitialState = state ?? null;
		}, expiredState);
		await expiredPage.goto(linkText);
		await expect(expiredPage.getByText("Link ungültig")).toBeVisible();
		await expiredPage.close();
	});
});

import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_WEB_BASE_URL ?? "http://127.0.0.1:3001";

export default defineConfig({
	testDir: "tests/e2e",
	timeout: 180_000,
	expect: {
		timeout: 30_000,
	},
	reporter: process.env.CI ? [["github"], ["html", { outputFolder: "playwright-report" }]] : "list",
	use: {
		baseURL,
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: [
		{
			command: "npm run dev:e2e",
			url: `${baseURL}/health`,
			timeout: 180_000,
			reuseExistingServer: !process.env.CI,
		},
	],
});

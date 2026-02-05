import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("e2e scripts", () => {
	it("keeps mock e2e startup independent from Convex backend dev", () => {
		const packageJsonPath = resolve(__dirname, "../../package.json");
		const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
			scripts?: Record<string, string>;
		};
		const script = packageJson.scripts?.["dev:e2e"];

		expect(script).toBeTypeOf("string");
		expect(script).toContain("VITE_E2E_MOCK=1");
		expect(script).not.toContain("--workspace @tendera/backend");
		expect(script).not.toContain("CONVEX_TEST_MODE=1");
	});
});

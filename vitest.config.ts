import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["tests/unit/**/*.test.ts"],
	},
	resolve: {
		alias: {
			"@tendera/backend": path.resolve(__dirname, "packages/backend"),
		},
	},
});

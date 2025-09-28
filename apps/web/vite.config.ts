import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const isE2E = process.env.VITE_E2E_MOCK === "1";

export default defineConfig({
	plugins: [tailwindcss(), tanstackRouter({}), react()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@tendera/backend": path.resolve(__dirname, "../../packages/backend"),
			...(isE2E
				? {
					"@clerk/clerk-react": path.resolve(__dirname, "./src/testing/mockClerk"),
					"convex/react": path.resolve(__dirname, "./src/testing/mockConvexReact"),
					"convex/react-clerk": path.resolve(
						__dirname,
						"./src/testing/mockConvexReactClerk",
					),
				}
				: {}),
		},
	},
});

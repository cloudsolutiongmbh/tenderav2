import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import Loader from "@/components/loader";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import {
	HeadContent,
	Outlet,
	createRootRouteWithContext,
	useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import "../index.css";

export interface RouterAppContext {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	head: () => ({
		meta: [
			{
				title: "tendera.ch",
			},
			{
				name: "description",
				content: "tendera ist eine Webanwendung",
			},
		],
		links: [
			{
				rel: "icon",
				href: "/favicon.ico",
			},
		],
	}),
});

function RootComponent() {
	const isFetching = useRouterState({
		select: (s) => s.isLoading,
	});

	return (
		<>
			<HeadContent />
            <ThemeProvider
                attribute="class"
                defaultTheme="light"
                disableTransitionOnChange
                storageKey="vite-ui-theme"
            >
                <SidebarProvider>
                    <AppSidebar />
                    <main className="flex-1 overflow-y-auto">
                        <div className="p-3">
                            {isFetching ? <Loader /> : <Outlet />}
                        </div>
                    </main>
                </SidebarProvider>
                <Toaster richColors />
            </ThemeProvider>
			<TanStackRouterDevtools position="bottom-left" />
		</>
	);
}

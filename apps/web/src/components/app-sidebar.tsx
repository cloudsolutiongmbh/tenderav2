import { Link, useRouterState } from "@tanstack/react-router";
import { FolderKanban, FileText, User2, Building2, ChevronLeft, Heart, HelpCircle, LogOut } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { ModeToggle } from "@/components/mode-toggle";
import { SignedIn, SignedOut, SignInButton, useClerk } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";

const items = [
  { title: "Projekte", to: "/projekte", icon: FolderKanban },
  { title: "Kriterienkataloge", to: "/templates", icon: FileText },
  { title: "FAQ", to: "/faq", icon: HelpCircle },
  { title: "Profil", to: "/profil", icon: User2 },
  { title: "Organisation", to: "/organisation", icon: Building2 },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { open } = useSidebar();
  const { signOut } = useClerk();

  return (
    <Sidebar>
      <SidebarHeader>
        <span className="font-semibold">tendera</span>
        <span className="ml-auto"><ModeToggle /></span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = pathname === item.to || pathname.startsWith(item.to);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link to={item.to} className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {open ? <span>{item.title}</span> : null}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator />
      </SidebarContent>
      <SidebarFooter>
		<SignedOut>
			<SignInButton
				mode="redirect"
				forceRedirectUrl="/onboarding"
				signUpForceRedirectUrl="/onboarding"
			>
				<Button className="w-full" variant="outline">Anmelden</Button>
			</SignInButton>
		</SignedOut>
        <SignedIn>
          <Button
            className="w-full justify-start"
            variant="ghost"
            onClick={() => signOut()}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {open ? <span>Abmelden</span> : null}
          </Button>
        </SignedIn>
        <div className="flex items-center justify-center gap-1 px-2 py-3 text-xs text-muted-foreground">
          <span>Made with</span>
          <Heart className="h-3 w-3 fill-red-500 text-red-500" />
          <span>by</span>
          <a
            href="https://cloud-solution.ch"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground hover:underline"
          >
            Cloud Solution GmbH
          </a>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

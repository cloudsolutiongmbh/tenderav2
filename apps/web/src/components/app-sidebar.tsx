import { Link, useRouterState } from "@tanstack/react-router";
import { Home, FolderKanban, FileText, User2, Building2, ChevronLeft } from "lucide-react";
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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { ModeToggle } from "@/components/mode-toggle";
import { SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";

const items = [
  { title: "Startseite", to: "/", icon: Home },
  { title: "Projekte", to: "/projekte", icon: FolderKanban },
  { title: "Templates", to: "/templates", icon: FileText },
  { title: "Profil", to: "/profil", icon: User2 },
  { title: "Organisation", to: "/organisation", icon: Building2 },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { open } = useSidebar();
  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarTrigger className="mr-2" />
        <span className="font-semibold">tendera</span>
        <span className="ml-auto"><ModeToggle /></span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
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
          <SignInButton mode="modal">
            <Button className="w-full" variant="outline">Anmelden</Button>
          </SignInButton>
        </SignedOut>
      </SidebarFooter>
    </Sidebar>
  );
}


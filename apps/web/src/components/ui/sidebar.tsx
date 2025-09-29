import React from "react";

type SidebarState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const SidebarContext = React.createContext<SidebarState | null>(null);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState<boolean>(true);

  const toggle = React.useCallback(() => setOpen((v) => !v), []);

  React.useEffect(() => {
    try {
      localStorage.setItem("sidebar_open", String(open));
    } catch {}
  }, [open]);

  return (
    <SidebarContext.Provider value={{ open, setOpen, toggle }}>
      <div className="flex h-svh w-full overflow-hidden">
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within a SidebarProvider");
  return ctx;
}

export function Sidebar({ children }: { children: React.ReactNode }) {
  const { open } = useSidebar();
  return (
    <aside
      className={
        "flex h-full shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200 " +
        (open ? "w-64" : "w-16")
      }
    >
      {children}
    </aside>
  );
}

export function SidebarHeader({ children }: { children?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b p-3">
      {children}
    </div>
  );
}

export function SidebarFooter({ children }: { children?: React.ReactNode }) {
  return <div className="mt-auto border-t p-3">{children}</div>;
}

export function SidebarContent({ children }: { children?: React.ReactNode }) {
  return <div className="flex-1 overflow-y-auto p-2">{children}</div>;
}

export function SidebarGroup({ children }: { children?: React.ReactNode }) {
  return <div className="mb-3 px-1">{children}</div>;
}

export function SidebarGroupLabel({ children }: { children?: React.ReactNode }) {
  return <div className="px-2 pb-1 text-xs font-semibold uppercase text-muted-foreground">{children}</div>;
}

export function SidebarGroupContent({ children }: { children?: React.ReactNode }) {
  return <div className="space-y-1">{children}</div>;
}

export function SidebarMenu({ children }: { children?: React.ReactNode }) {
  return <ul className="flex flex-col gap-1">{children}</ul>;
}

export function SidebarMenuItem({ children }: { children?: React.ReactNode }) {
  return <li>{children}</li>;
}

export function SidebarMenuButton({
  children,
  isActive,
  asChild,
}: {
  children: React.ReactNode;
  isActive?: boolean;
  asChild?: boolean;
}) {
  const base =
    "group flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors";
  const active = isActive ? " bg-sidebar-accent text-sidebar-accent-foreground" : "";
  if (asChild) return <span className={base + active}>{children}</span>;
  return <button className={base + active}>{children}</button>;
}

export function SidebarSeparator() {
  return <div className="my-2 h-px bg-sidebar-border" />;
}

export function SidebarTrigger({ className = "" }: { className?: string }) {
  const { toggle } = useSidebar();
  return (
    <button
      onClick={toggle}
      className={
        "inline-flex items-center rounded-md border px-2 py-1 text-sm hover:bg-muted " +
        className
      }
    >
      ☰
    </button>
  );
}

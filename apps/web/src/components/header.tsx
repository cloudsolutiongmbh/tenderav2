import { Link, useNavigate } from "@tanstack/react-router";
import { ModeToggle } from "./mode-toggle";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  useUser,
  useClerk,
} from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export default function Header() {
	const links = [
		{ to: "/", label: "Startseite" },
		{ to: "/projekte", label: "Projekte" },
		{ to: "/templates", label: "Templates" },
		{ to: "/profil", label: "Profil" },
		{ to: "/organisation", label: "Organisation" },
	] as const;

	return (
		<div>
			<div className="flex flex-row items-center justify-between px-2 py-1">
				<nav className="flex gap-4 text-lg">
					{links.map(({ to, label }) => {
						return (
							<Link key={to} to={to}>
								{label}
							</Link>
						);
					})}
				</nav>
				<div className="flex items-center gap-2">
					<ModeToggle />
					<SignedOut>
						<SignInButton
							mode="redirect"
							forceRedirectUrl="/onboarding"
							signUpForceRedirectUrl="/onboarding"
						>
							<Button variant="secondary">Anmelden</Button>
						</SignInButton>
					</SignedOut>
					<SignedIn>
						<UserMenu />
					</SignedIn>
				</div>
			</div>
			<hr />
		</div>
	);
}

function UserMenu() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const avatar = user?.imageUrl;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="rounded-full">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar}
              alt="Benutzerbild"
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <span className="h-8 w-8 rounded-full bg-muted" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => navigate({ to: "/profil" })}>
          Profil
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate({ to: "/organisation" })}>
          Organisation
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => signOut()}>
          Abmelden
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

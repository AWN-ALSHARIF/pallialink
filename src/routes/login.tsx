import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { HeartHandshake, Stethoscope, User, UserCog, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Disclaimer, LangButton, Logo } from "@/components/shell";
import { useApp, useName } from "@/lib/app";
import { type Role } from "@/lib/store";
import { roleDashboard } from "@/lib/navigation";
import { demoAccountGroups } from "@/lib/demo-accounts";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Demo sign-in | PalliaLink" },
      { name: "description", content: "Choose a demo role to explore the PalliaLink prototype." },
      { property: "og:title", content: "Demo sign-in | PalliaLink" },
      { property: "og:description", content: "Explore PalliaLink as a patient, caregiver, nurse, physician or admin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Login,
});

const icons: Record<Role, typeof User> = { patient: User, caregiver: Users, nurse: HeartHandshake, physician: Stethoscope, admin: UserCog };

function Login() {
  const { t, setUserId } = useApp();
  const name = useName();
  const navigate = useNavigate();
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const signingIn = useRef(false);
  const groups = demoAccountGroups();
  const router = useRouter();
  // Warm dashboard code while the user chooses an account; no data is fetched here.
  useEffect(() => { for (const to of ["/patient", "/clinic", "/care", "/admin"] as const) void router.loadRouteChunk(router.routesByPath[to]).catch(() => {}); }, [router]);
  const signIn = async (id: string, role: Role) => {
    if (signingIn.current) return;
    signingIn.current = true;
    setPending(id);
    setFailed(false);
    try {
      await setUserId(id);
      await navigate({ to: roleDashboard(role) });
    } catch { setFailed(true); }
    finally { signingIn.current = false; setPending(null); }
  };
  return (
    <div className="min-h-screen bg-hero">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Logo />
        <LangButton />
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-10 pt-2 sm:pb-16 sm:pt-6">
        <h1 className="text-2xl font-bold text-navy sm:text-3xl">{t.chooseRole}</h1>
        <p className="mt-2 text-muted-foreground">{t.chooseRoleSub}</p>
        {failed && <p role="alert" className="mt-3 text-sm text-destructive">{t.signInError}</p>}
        <div className="mt-6 space-y-6 sm:mt-8 sm:space-y-8">
          {groups.map(({ role, users }) => (
            <section key={role} aria-labelledby={`group-${role}`}>
              <h2 id={`group-${role}`} className="mb-2 text-sm font-bold text-navy sm:mb-3 sm:text-base">{t.loginGroups[role]}</h2>
              <div className="grid gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {users.map((u) => {
            const Icon = icons[u.role];
            return (
              <Button
                key={u.id}
                variant="outline"
                disabled={pending !== null}
                aria-busy={pending === u.id}
                onClick={() => { void signIn(u.id, u.role); }}
                className="card group grid h-auto min-h-24 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 whitespace-normal rounded-lg p-3 text-start transition-colors hover:border-primary sm:min-h-48 sm:grid-cols-1 sm:content-start sm:gap-0 sm:p-6 [&_svg]:size-5 sm:[&_svg]:size-6"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-primary group-hover:bg-primary group-hover:text-primary-foreground sm:size-12"><Icon /></span>
                <span className="block min-w-0 sm:mt-4">
                  <span className="block text-xs font-semibold text-primary sm:text-sm">{t.roles[u.role]}</span>
                  <span className="mt-0.5 block text-base font-bold text-navy sm:mt-1 sm:text-lg">{name(u)}</span>
                  <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground sm:mt-2 sm:text-sm">{pending === u.id ? t.signingIn : t.roleDesc[u.role]}</span>
                </span>
              </Button>
            );
          })}
              </div>
            </section>
          ))}
        </div>
        <Disclaimer className="mt-10" />
      </main>
    </div>
  );
}

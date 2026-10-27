import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { HeartHandshake, Stethoscope, User, UserCog, Users } from "lucide-react";
import { Disclaimer, LangButton, Logo } from "@/components/shell";
import { useApp, useName } from "@/lib/app";
import { isClinical, USERS, type Role } from "@/lib/store";

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
  return (
    <div className="min-h-screen bg-hero">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <Logo />
        <LangButton />
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-6">
        <h1 className="text-3xl font-bold text-navy">{t.chooseRole}</h1>
        <p className="mt-2 text-muted-foreground">{t.chooseRoleSub}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {USERS.map((u) => {
            const Icon = icons[u.role];
            return (
              <button
                key={u.id}
                onClick={() => { setUserId(u.id); navigate({ to: isClinical(u.role) ? "/clinic" : "/patient" }); }}
                className="card group p-6 text-start transition hover:-translate-y-0.5 hover:border-primary"
              >
                <span className="grid size-12 place-items-center rounded-xl bg-accent text-primary group-hover:bg-primary group-hover:text-primary-foreground"><Icon className="size-6" /></span>
                <div className="mt-4 text-sm font-semibold text-primary">{t.roles[u.role]}</div>
                <div className="mt-1 text-lg font-bold text-navy">{name(u)}</div>
                <p className="mt-2 text-sm text-muted-foreground">{t.roleDesc[u.role]}</p>
              </button>
            );
          })}
        </div>
        <Disclaimer className="mt-10" />
      </main>
    </div>
  );
}

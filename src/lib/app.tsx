import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { currentPersonaId, refresh, signInAs, signOut, subscribe, userById, type User } from "./store";
import { dict, type Lang } from "./i18n";

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (typeof dict)["ar"];
  user: User | null;
  setUserId: (id: string | null) => Promise<void>;
  ready: boolean;
}
const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");
  const [userId, setUserIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const l = localStorage.getItem("pallialink.lang");
    if (l === "en" || l === "ar") setLangState(l);
    // Identity comes from the backend session; report data is always reloaded from the database.
    (async () => {
      try {
        const id = await currentPersonaId();
        setUserIdState(id);
        if (id) await refresh();
      } catch { setUserIdState(null); }
      setReady(true);
    })();
    // Pick up changes made in other tabs or by other roles when returning to the page.
    const onFocus = () => { void refresh().catch(() => {}); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = (l: Lang) => { localStorage.setItem("pallialink.lang", l); setLangState(l); };
  const setUserId = async (id: string | null) => {
    if (id) await signInAs(id); else await signOut();
    setUserIdState(id);
  };
  return (
    <AppCtx.Provider value={{ lang, setLang, t: dict[lang], user: userById(userId ?? undefined) ?? null, setUserId, ready }}>
      {children}
    </AppCtx.Provider>
  );
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("AppProvider missing");
  return c;
}

/** Re-render whenever the data mirror changes. */
export function useStoreVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    setV((x) => x + 1);
    const un = subscribe(() => setV((x) => x + 1));
    return () => { un(); };
  }, []);
  return v;
}

export function useName() {
  const { lang } = useApp();
  return (x: { nameAr: string; nameEn: string } | undefined) => (x ? (lang === "ar" ? x.nameAr : x.nameEn) : "—");
}

export function useFmtDate() {
  const { lang } = useApp();
  return (iso: string) =>
    new Date(iso).toLocaleString(lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
}

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

const PERSONAS = ["u-pat", "u-cg", "u-nurse", "u-doc", "u-doc2", "u-admin", "u-xnurse"];

/**
 * Demo sign-in: each persona is a real backend account so database rules apply.
 * Accounts are created on first use; passwords are derived server-side and never sent to the browser.
 */
export const demoSignIn = createServerFn({ method: "POST" })
  .inputValidator((d: { personaId: string }) => {
    if (!PERSONAS.includes(d?.personaId)) throw new Error("unknown persona");
    return { personaId: d.personaId };
  })
  .handler(async ({ data }) => {
    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const secret = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:${data.personaId}`));
    const password = btoa(String.fromCharCode(...new Uint8Array(digest))).slice(0, 32);
    const email = `${data.personaId}@demo.pallialink.example.com`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("app_users").select("auth_id").eq("persona_id", data.personaId).maybeSingle();
    if (!row?.auth_id) {
      const created = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
      let authId = created.data.user?.id;
      if (!authId) {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
        const existing = list.users.find((u) => u.email === email);
        if (!existing) throw new Error(created.error?.message ?? "could not create demo user");
        await supabaseAdmin.auth.admin.updateUserById(existing.id, { password });
        authId = existing.id;
      }
      await supabaseAdmin.from("app_users").update({ auth_id: authId }).eq("persona_id", data.personaId);
    }

    const pub = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: s, error } = await pub.auth.signInWithPassword({ email, password });
    if (error || !s.session) throw new Error(error?.message ?? "sign-in failed");
    return { access_token: s.session.access_token, refresh_token: s.session.refresh_token };
  });

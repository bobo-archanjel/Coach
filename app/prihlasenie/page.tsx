import { AuthView } from "./AuthView";

/* Formulár je zdieľaný s /v6design/prihlasenie (iný vzhľad, rovnaké správanie) — AuthView.tsx.
   force-dynamic: AuthView vytvára Supabase klienta už pri prvom renderi (useState), takže
   statický prerender tejto stránky by ho spustil počas buildu bez runtime env vars a build
   na Verceli by zlyhal (Invalid supabaseUrl). */
export const dynamic = "force-dynamic";

export default function AuthPage() {
  return <AuthView />;
}

import { AuthView } from "./AuthView";

/* force-dynamic: AuthView vytvára Supabase klienta už pri prvom renderi (useState), takže
   statický prerender tejto stránky by ho spustil počas buildu bez runtime env vars a build
   na Verceli by zlyhal (Invalid supabaseUrl). Téma (cookie) sa číta v layout.tsx. */
export const dynamic = "force-dynamic";

export default function AuthPage() {
  return <AuthView />;
}

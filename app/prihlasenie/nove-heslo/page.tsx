import { NewPasswordView } from "./NewPasswordView";

/* force-dynamic: NewPasswordView vytvára Supabase klienta už pri prvom renderi (useState),
   takže statický prerender tejto stránky by ho spustil počas buildu bez runtime env vars
   a build na Verceli by zlyhal (Invalid supabaseUrl). */
export const dynamic = "force-dynamic";

export default function NewPasswordPage() {
  return <NewPasswordView />;
}

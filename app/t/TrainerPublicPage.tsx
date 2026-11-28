import tokens from "@/app/v6design/styles/tokens.module.css";
import brand from "@/app/components/branding.module.css";
import { brandStyle } from "@/lib/branding/theme";
import { recipeFor, type SectionSpec } from "@/lib/publicPage/templates";
import type { PublicPageData } from "@/lib/publicPage/types";
import { About } from "./sections/About";
import { Contact } from "./sections/Contact";
import { Gallery } from "./sections/Gallery";
import { Hero } from "./sections/Hero";
import { Powered } from "./sections/Powered";
import { Services } from "./sections/Services";
import { Socials } from "./sections/Socials";
import { Testimonials } from "./sections/Testimonials";
import styles from "./publicPage.module.css";
import tpl from "./templates.module.css";

/* Vykreslenie verejnej stránky trénera (Business). Zdieľa ho /t/<handle> aj náhľad v dashboarde.
   Šablóna (page.template) je len „recept“: poradie sekcií, variant každej a štýlové tokeny
   (lib/publicPage/templates.ts) — obsah je vždy ten istý. Sekcie sú v ./sections/*.
   Všetky texty od trénera sú obyčajný text — React ich escapuje, zalomenia rieši CSS (pre-line);
   žiadne dangerouslySetInnerHTML ani markdown. Externé odkazy majú rel="nofollow noopener noreferrer".
   Téma podľa telefónu (data-theme="auto") alebo vynútená šablónou (svetlá/tmavá), takže stránka nepotrebuje
   cookie → dá sa cachovať (ISR). */

function renderSection(spec: SectionSpec, page: PublicPageData, preview: boolean) {
  switch (spec.kind) {
    case "hero":
      return <Hero key="hero" page={page} spec={spec} />;
    case "about":
      return <About key="about" page={page} spec={spec} />;
    case "services":
      return <Services key="services" page={page} spec={spec} />;
    case "gallery":
      return <Gallery key="gallery" page={page} spec={spec} />;
    case "testimonials":
      return <Testimonials key="testimonials" page={page} spec={spec} />;
    case "contact":
      return <Contact key="contact" page={page} spec={spec} preview={preview} />;
    case "socials":
      return <Socials key="socials" page={page} spec={spec} />;
    case "powered":
      return <Powered key="powered" preview={preview} />;
  }
}

export function TrainerPublicPage({ page, preview = false, previewBanner }: { page: PublicPageData; preview?: boolean; previewBanner?: string }) {
  const recipe = recipeFor(page.template);

  return (
    <div
      className={`${tokens.root} ${tpl.root} ${page.theme ? brand.branded : ""}`}
      style={brandStyle(page.theme)}
      data-theme={recipe.tone}
      data-template={recipe.id}
      data-radius={recipe.radius}
      data-density={recipe.density}
      data-heading={recipe.heading}
      data-v6-root=""
      data-testid="public-trainer-page"
    >
      <main className={styles.page}>
        {previewBanner && (
          <p className={styles.previewBanner} role="note">
            {previewBanner}
          </p>
        )}
        {recipe.sections.map((spec) => renderSection(spec, page, preview))}
      </main>
    </div>
  );
}

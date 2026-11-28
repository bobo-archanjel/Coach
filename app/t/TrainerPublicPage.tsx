import { brandStyle } from "@/lib/branding/theme";
import { recipeFor, visibleSections, type SectionSpec } from "@/lib/publicPage/templates";
import type { PublicPageData } from "@/lib/publicPage/types";
import { TEMPLATE_FONT_CLASS } from "./fonts";
import { About } from "./sections/About";
import { Contact } from "./sections/Contact";
import { Footer } from "./sections/Footer";
import { Gallery } from "./sections/Gallery";
import { Hero } from "./sections/Hero";
import { Nav } from "./sections/Nav";
import { Services } from "./sections/Services";
import { Testimonials } from "./sections/Testimonials";
import styles from "./site.module.css";

/* Vykreslenie verejnej stránky trénera (Business) ako samostatného webu: lišta s navigáciou, hrdina, sekcie ako pásy
   na celú šírku, kontakt a päta. Zdieľa ho /t/<handle> aj náhľad v dashboarde.
   Šablóna (page.template) je „recept“ (lib/publicPage/templates.ts): poradie sekcií, variant každej a pevný tón;
   farby, písma a tvary sú v site.module.css podľa data-template. Obsah je vždy ten istý. Vzhľad NIE JE dizajn appky
   (v6) — je to web trénera; FitPilot sa objaví len v päte. Akcent = farba trénera (--brand-*), inak vlastná farba šablóny.
   Všetky texty od trénera sú obyčajný text — React ich escapuje, zalomenia rieši CSS (pre-line); žiadne
   dangerouslySetInnerHTML ani markdown. Externé odkazy majú rel="nofollow noopener noreferrer".
   Tón je pevný podľa šablóny, takže stránka nepotrebuje cookie → dá sa cachovať (ISR). Rozloženie sa riadi šírkou
   kontajnera (@container), nie okna — rovnako vyzerá na /t/<handle> aj v rámčeku náhľadu v dashboarde. */

function renderSection(spec: SectionSpec, page: PublicPageData, band: "base" | "alt", preview: boolean, all: SectionSpec[]) {
  switch (spec.kind) {
    case "hero":
      return <Hero key="hero" page={page} spec={spec} hasServices={all.some((s) => s.kind === "services")} hasAbout={all.some((s) => s.kind === "about")} />;
    case "about":
      return <About key="about" page={page} spec={spec} band={band} />;
    case "services":
      return <Services key="services" page={page} spec={spec} band={band} />;
    case "testimonials":
      return <Testimonials key="testimonials" page={page} spec={spec} band={band} />;
    case "gallery":
      return <Gallery key="gallery" page={page} spec={spec} band={band} />;
    case "contact":
      return <Contact key="contact" page={page} spec={spec} band={band} preview={preview} />;
  }
}

export function TrainerPublicPage({ page, preview = false, previewBanner }: { page: PublicPageData; preview?: boolean; previewBanner?: string }) {
  const recipe = recipeFor(page.template);
  const sections = visibleSections(recipe, page);

  return (
    <div className={styles.frame}>
      <div
        className={`${styles.root} ${TEMPLATE_FONT_CLASS[recipe.id]}`}
        style={brandStyle(page.theme)}
        data-theme={recipe.tone}
        data-template={recipe.id}
        data-embedded={preview ? "" : undefined}
        data-testid="public-trainer-page"
      >
        {previewBanner && (
          <p className={styles.previewBanner} role="note">
            {previewBanner}
          </p>
        )}
        <Nav page={page} sections={sections} />
        <main>
          {/* pozadia sa striedajú medzi vykreslenými sekciami (hrdina = základ) */}
          {sections.map((spec, i) => renderSection(spec, page, i % 2 === 0 ? "base" : "alt", preview, sections))}
        </main>
        <Footer page={page} preview={preview} />
      </div>
    </div>
  );
}

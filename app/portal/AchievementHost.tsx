import { getTranslations } from "next-intl/server";
import { createClient, getMyClient, getUser } from "@/lib/supabase/server";
import { badgeById, canonicalBadgeId } from "@/lib/gamification/badges";
import { rewardsBetween } from "@/lib/gamification/rewards";
import { loadUnseenAchievements } from "@/lib/gamification/server";
import { UnlockModal, type UnlockItem } from "./UnlockModal";

/* Oslava nových úspechov v layoute portálu: jeden lacný dopyt (čiastočný index na
   seen_at IS NULL) pri každej navigácii. Po zápise (ukončenie tréningu, jedlo, meranie)
   akcie obnovia layout, takže sa modal ukáže hneď. Backfillnuté úspechy sú tiché
   (seen_at nastavené pri vložení), tu sa nikdy neobjavia. */
export async function AchievementHost() {
  const {
    data: { user },
  } = await getUser();
  if (!user) return null;
  const { data: client } = await getMyClient(user.id);
  if (!client) return null;
  const supabase = await createClient();
  const unseen = await loadUnseenAchievements(supabase, client.id);
  if (unseen.length === 0) return null;

  const t = await getTranslations("gamification");
  const items: UnlockItem[] = [];
  for (const a of unseen) {
    if (a.kind === "pr" && a.exerciseName && a.value != null) {
      items.push({
        id: a.id,
        icon: "trophy",
        title: t("unlock.prTitle", { exercise: a.exerciseName, weight: a.value }),
        sub: t("unlock.prSub", { weight: a.value, reps: a.reps ?? 1 }),
        shareHref: `/api/gamification/share?a=${a.id}`,
      });
    } else if (a.kind === "level" && a.level != null) {
      const r = rewardsBetween(a.levelFrom ?? a.level - 1, a.level);
      const chips = [
        ...r.frames.map((f) => t("rewards.item.frame", { name: t(`frames.${f}` as never) })),
        ...r.themes.map((th) => t("rewards.item.theme", { name: t(`themes.${th}` as never) })),
        ...Array.from({ length: r.freezes }, () => t("rewards.item.freeze")),
      ];
      items.push({
        id: a.id,
        icon: "star",
        title: t("unlock.levelTitle", { n: a.level, title: t(`levelTitles.${a.level}` as never) }),
        sub: chips.length > 0 ? t("levelUp.rewardsTitle") : t("unlock.levelSub"),
        chips,
      });
    } else if (a.kind === "badge" && a.badgeId) {
      const def = badgeById(canonicalBadgeId(a.badgeId));
      if (!def) continue; // odznak, ktorý už nie je v katalógu
      items.push({
        id: a.id,
        icon: def.icon,
        title: t("unlock.badgeTitle", { name: t(`badges.${def.id}.name` as never) }),
        sub: t(`badges.${def.id}.desc` as never),
        shareHref: `/api/gamification/share?a=${a.id}`,
      });
    } else if (a.kind === "challenge" && a.challengeName) {
      items.push({
        id: a.id,
        icon: "trophy",
        title: t("unlock.challengeTitle", { name: a.challengeName }),
        sub: t("unlock.challengeSub"),
        shareHref: `/api/gamification/share?a=${a.id}`,
      });
    }
  }
  if (items.length === 0) return null;

  return (
    <UnlockModal
      key={items.map((i) => i.id).join(",")}
      items={items}
      labels={{
        close: t("unlock.close"),
        next: t("unlock.next"),
        aria: t("unlock.aria"),
        viewAll: t("unlock.viewAll"),
        positions: items.map((_, i) => t("unlock.position", { index: i + 1, total: items.length })),
      }}
    />
  );
}

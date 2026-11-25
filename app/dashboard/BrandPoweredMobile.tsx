"use client";

import { usePathname } from "next/navigation";
import brand from "../components/branding.module.css";
import styles from "./dashboard.module.css";

/** „Beží na FitPilot“ pod Nastaveniami na mobile (v bočnom paneli je len na počítači). */
export function BrandPoweredMobile({ text }: { text: string }) {
  const pathname = usePathname();
  if (!pathname.startsWith("/dashboard/nastavenia")) return null;
  return <p className={`${brand.poweredBy} ${styles.poweredMobile}`}>{text}</p>;
}

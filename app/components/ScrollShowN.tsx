"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import g from "./gamification.module.css";

/* Zoznam, ktorý ukáže presne `visible` prvých riadkov a zvyšok sa posúva vnútri. Riadky majú rôznu výšku,
   preto sa výška meria (spodok N-tého riadku) a sleduje ResizeObserverom. */
export function ScrollShowN({
  visible = 3,
  as: Tag = "ul",
  className,
  children,
  ...rest
}: {
  visible?: number;
  as?: "ul" | "ol" | "div";
  className?: string;
  children: ReactNode;
  "data-testid"?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [max, setMax] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rows = el.children;
      if (rows.length <= visible) return setMax(null);
      const last = rows[visible - 1] as HTMLElement;
      setMax(last.offsetTop - el.offsetTop + last.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [visible, children]);

  const Comp = Tag as "ul";
  return (
    <Comp
      ref={ref as React.RefObject<HTMLUListElement>}
      className={`${g.scrollN} ${className ?? ""}`}
      style={max != null ? { maxHeight: max } : undefined}
      data-scroll={max != null || undefined}
      {...rest}
    >
      {children}
    </Comp>
  );
}

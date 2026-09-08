"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import styles from "../page.module.css";

const PlusIcon = ({ open }: { open: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ transformOrigin: "center", transform: open ? "rotate(45deg)" : "none", transition: "transform 0.25s ease" }} />
  </svg>
);

export function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.faqItem}>
      <button type="button" className={styles.faqQuestion} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {question}
        <span className={styles.faqIcon}>
          <PlusIcon open={open} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className={styles.faqAnswerWrap}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className={styles.faqAnswer}>{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

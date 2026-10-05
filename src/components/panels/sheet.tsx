"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";

/**
 * A panel over the map: a bottom sheet on phones, a side panel on desktop.
 * The map stays visible (and interactive) around it.
 */
export function Sheet({
  open,
  onClose,
  title,
  icon,
  children,
  className,
  sheetKey,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  sheetKey?: string;
}) {
  const { t } = useT();
  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key={sheetKey ?? "sheet"}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: "spring", stiffness: 420, damping: 38 }}
          className={cn(
            "glass-strong fixed inset-x-0 bottom-0 z-40 flex max-h-[72dvh] flex-col rounded-t-2xl pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] lg:inset-x-auto lg:bottom-[5.5rem] lg:right-3 lg:top-[5.25rem] lg:max-h-none lg:w-[460px] lg:rounded-2xl",
            className,
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/20 lg:hidden" />
          <div className="flex shrink-0 items-center gap-2.5 px-4 pb-3 pt-2 lg:pt-4">
            {icon && <span className="text-2xl leading-none">{icon}</span>}
            <h2 className="min-w-0 flex-1 truncate pr-1 text-[28px] leading-[1.1]">{title}</h2>
            <button
              onClick={onClose}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-stop text-white shadow-[0_3px_0_0_#a82424] transition hover:brightness-110 active:translate-y-[2px]"
              aria-label={t("map.close")}
            >
              <X className="size-6 stroke-[3.5]" />
            </button>
          </div>
          <div className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:px-4">{children}</div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

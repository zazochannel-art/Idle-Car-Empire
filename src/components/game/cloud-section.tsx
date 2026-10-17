"use client";

import { Bell, ChevronRight, Cloud } from "lucide-react";
import { useState } from "react";
import { useT } from "@/i18n/use-t";
import { askNotify, notifySupported } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useCloud } from "@/store/cloud-store";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { useSaveStatus } from "./account";

/** In the settings: the account and how the save goes, opening the profile. */
export function CloudSection({ onOpen }: { onOpen?: () => void }) {
  const profile = useCloud((c) => c.profile);
  const account = useCloud((c) => c.account);
  const setView = useUi((u) => u.setView);
  const { text } = useSaveStatus();
  const { t } = useT();
  return (
    <button
      onClick={() => {
        onOpen?.();
        setView("profile");
      }}
      className="flex w-full items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5 text-left ring-1 ring-white/10 hover:bg-white/[0.07]"
    >
      <span className="text-2xl">{profile?.avatar ?? "👤"}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{profile?.username ?? t("account.title")}</span>
        <span className="flex items-center gap-1 text-[11px] text-white/50">
          <Cloud className="size-3" /> {text}
          {account && <span className="truncate">· {account.guest ? t("account.guestShort") : (account.email ?? "")}</span>}
        </span>
      </span>
      <ChevronRight className="size-4 text-white/40" />
    </button>
  );
}

/** Notifications while away: turning them on asks the phone first. */
export function NotifyToggle() {
  const on = useGame((g) => g.state.settings.notify);
  const setPref = useGame((g) => g.setPref);
  const { t } = useT();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <>
      <button
        role="switch"
        aria-checked={on}
        onClick={async () => {
          setMsg(null);
          if (on) return setPref("notify", false);
          if (!notifySupported()) return setMsg(t("notify.unsupported"));
          if (await askNotify()) setPref("notify", true);
          else setMsg(t("notify.blocked"));
        }}
        className="flex w-full items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5 text-left ring-1 ring-white/10"
      >
        <Bell className="size-4 shrink-0 text-white/60" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t("notify.label")}</span>
          <span className="block text-[11px] text-white/45">{t("notify.hint")}</span>
        </span>
        <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition", on ? "bg-emerald-500" : "bg-white/15")}>
          <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", on ? "left-[1.125rem]" : "left-0.5")} />
        </span>
      </button>
      {msg && <p className="px-1 text-[11px] text-amber-300">{msg}</p>}
    </>
  );
}

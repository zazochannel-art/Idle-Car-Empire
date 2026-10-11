"use client";

import { Bell, Cloud, Mail, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PREFER_CLOUD_KEY } from "@/game/save";
import { useT } from "@/i18n/use-t";
import { askNotify, notifySupported } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useGame } from "@/store/game-store";

/** Where the email links bring the player back: this page, without its hash. */
const here = () => window.location.href.split("#")[0];

/**
 * Cloud save: the game saves to the cloud as a guest on this device; an
 * email keeps that save and lets the player continue it on another device.
 */
export function CloudSection() {
  const cloud = useGame((g) => g.cloud);
  const syncNow = useGame((g) => g.syncNow);
  const { t } = useT();
  const [who, setWho] = useState<{ email: string | null } | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cloud) return;
    let live = true;
    cloud
      .account()
      .then((a) => live && setWho(a))
      .catch(() => live && setWho(null));
    return () => {
      live = false;
    };
  }, [cloud]);

  if (!cloud) return <p className="text-[11px] text-white/45">☁️ {t("cloud.off")}</p>;

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      setMsg(r.ok ? { text: ok } : { text: r.error ? t("cloud.failedWhy", { why: r.error }) : t("cloud.failed"), bad: true });
    } catch {
      setMsg({ text: t("cloud.failed"), bad: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/10">
      <div className="flex items-center gap-2 text-sm font-bold">
        <Cloud className="size-4 text-sky-300" /> {t("cloud.title")}
      </div>
      <p className="text-[11px] leading-snug text-white/55">
        {who === undefined ? t("cloud.checking") : who === null ? t("cloud.offline") : who.email ? t("cloud.linked", { email: who.email }) : t("cloud.guest")}
      </p>
      {who !== null && who !== undefined && (
        <>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("cloud.emailPh")}
            className="h-10 w-full rounded-xl bg-black/40 px-3 text-base text-white/85 ring-1 ring-white/10 outline-none focus:ring-electric/50"
          />
          <div className={cn("grid gap-1.5", who.email ? "grid-cols-1" : "grid-cols-2")}>
            {!who.email && (
              <Button size="sm" variant="gold" disabled={!valid || busy} onClick={() => run(() => cloud.linkEmail(email.trim(), here()), t("cloud.linkSent"))}>
                <Mail /> {t("cloud.link")}
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={!valid || busy}
              onClick={() =>
                run(async () => {
                  const r = await cloud.signIn(email.trim(), here());
                  // back from the link, this device takes the account's save
                  if (r.ok) {
                    try {
                      localStorage.setItem(PREFER_CLOUD_KEY, "1");
                    } catch {
                      // storage blocked: the newer copy wins as usual
                    }
                  }
                  return r;
                }, t("cloud.signInSent"))
              }
            >
              {t("cloud.signIn")}
            </Button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="w-full"
            onClick={() => {
              syncNow();
              setMsg({ text: t("cloud.synced") });
            }}
          >
            <RefreshCw /> {t("cloud.sync")}
          </Button>
        </>
      )}
      {msg && <p className={cn("text-center text-xs", msg.bad ? "text-rose-300" : "text-sky-300")}>{msg.text}</p>}
    </div>
  );
}

/** Notifications while away: turning them on asks the browser first. */
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

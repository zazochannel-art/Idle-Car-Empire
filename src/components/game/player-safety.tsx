"use client";

// What a player can do about another player (Google Play's rules for content
// players make): report them or their alliance to the developer (on the server,
// supabase/migrations/0008), or hide them from their own boards (in their save,
// listed in the Profile). And the line under every "create account" button.
import { EyeOff, Flag } from "lucide-react";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { REPORT_REASONS, type ReportReason, type ReportResult } from "@/game/save";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { PRIVACY_URL, TERMS_URL } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { uiEvents } from "@/store/events";
import { useGame } from "@/store/game-store";

type Sent = ReportResult | "error" | "sending" | null;

const sentText = (r: Exclude<Sent, null | "sending">): MessageKey => (r === "ok" ? "flag.sent" : r === "limit" ? "flag.limit" : "flag.error");

/** Under another player's card: report them (a reason, once) or hide them. */
export function PlayerActions({ userId, name, onHidden }: { userId: string; name: string; onHidden?: () => void }) {
  const saves = useGame((g) => g.saves);
  const hide = useGame((g) => g.hidePlayer);
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<Sent>(null);
  const report = async (reason: ReportReason) => {
    const social = saves?.social;
    if (!social) return;
    setSent("sending");
    setSent(await social.reportPlayer(userId, reason).catch(() => "error" as const));
  };
  return (
    <div className="space-y-2">
      {open && (
        <div className="space-y-1.5 rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/10">
          <div className="text-sm font-bold">🚩 {t("flag.title")}</div>
          <p className="text-[11px] leading-snug text-white/55">{t("flag.hint")}</p>
          {sent && sent !== "sending" ? (
            <p className={cn("text-center text-xs", sent === "ok" ? "text-emerald-300" : "text-amber-300")}>{t(sentText(sent))}</p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {REPORT_REASONS.map((r) => (
                <Button key={r} size="sm" variant="secondary" className="h-auto min-h-8 whitespace-normal py-1.5 text-[12px] leading-tight" disabled={sent === "sending"} onClick={() => void report(r)}>
                  {t(`flag.reason.${r}` as MessageKey)}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <Button size="sm" variant="ghost" className="text-white/60" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Flag /> {t("flag.report")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-white/60"
          onClick={() => {
            hide(userId, name);
            uiEvents.emit({ type: "toast", tone: "info", icon: "🙈", title: t("hide.done", { name: name || "—" }), body: t("hide.hint") });
            onHidden?.();
          }}
        >
          <EyeOff /> {t("hide.hide")}
        </Button>
      </div>
    </div>
  );
}

/** A small flag on an alliance member's row: the same report and hide, in a dialog. */
export function FlagMember({ userId, name }: { userId: string; name: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button aria-label={t("flag.member", { name })} className="rounded-lg p-1.5 text-white/35 hover:bg-white/10 hover:text-amber-300" onClick={() => setOpen(true)}>
        <Flag className="size-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle className="truncate text-xl">{name || "—"}</DialogTitle>
          <DialogDescription className="sr-only">{t("flag.title")}</DialogDescription>
          <div className="mt-3">
            <PlayerActions userId={userId} name={name} onHidden={() => setOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A small flag on an alliance's row: reports its name or tag, after a confirmation. */
export function FlagAlliance({ id, name }: { id: string; name: string }) {
  const saves = useGame((g) => g.saves);
  const { t } = useT();
  const [asking, setAsking] = useState(false);
  const [sent, setSent] = useState<Sent>(null);
  return (
    <>
      <button aria-label={t("flag.alliance")} className="rounded-lg p-1.5 text-white/35 hover:bg-white/10 hover:text-amber-300" onClick={() => setAsking(true)}>
        <Flag className="size-4" />
      </button>
      <Dialog
        open={asking}
        onOpenChange={(o) => {
          setAsking(o);
          if (!o) setSent(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="text-xl">🚩 {t("flag.alliance")}</DialogTitle>
          <DialogDescription className="mt-1">{t("flag.allianceConfirm", { name })}</DialogDescription>
          <p className="mt-2 text-[11px] leading-snug text-white/55">{t("flag.hint")}</p>
          {sent && sent !== "sending" ? (
            <p className={cn("mt-3 text-center text-xs", sent === "ok" ? "text-emerald-300" : "text-amber-300")}>{t(sentText(sent))}</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => setAsking(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                size="sm"
                variant="gold"
                disabled={sent === "sending" || !saves?.social}
                onClick={async () => {
                  setSent("sending");
                  setSent((await saves?.social?.reportAlliance(id).catch(() => "error" as const)) ?? "error");
                }}
              >
                <Flag /> {t("flag.report")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The Profile's list of hidden players, each shown again with a tap. */
export function HiddenPlayersCard() {
  const hidden = useGame((g) => g.view.state.settings.hidden);
  const unhide = useGame((g) => g.unhidePlayer);
  const { t } = useT();
  if (!hidden.length) return null;
  return (
    <div className="space-y-2 rounded-2xl bg-[#2b2b2e] p-3 ring-1 ring-white/10">
      <div className="flex items-center gap-2 text-sm font-bold">
        <EyeOff className="size-4 text-white/60" /> {t("hide.title")} · {hidden.length}
        {hidden.length > 1 && (
          <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-[11px]" onClick={() => unhide(null)}>
            {t("hide.showAll")}
          </Button>
        )}
      </div>
      <p className="text-[11px] text-white/55">{t("hide.listHint")}</p>
      <div className="space-y-1">
        {hidden.map((h) => (
          <div key={h.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-1.5 ring-1 ring-white/[0.07]">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{h.name || "—"}</span>
            <Button size="sm" variant="secondary" className="h-7 px-2.5 text-[11px]" onClick={() => unhide(h.id)}>
              {t("hide.show")}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "By creating an account, you agree to the Terms of Use and the Privacy Policy", with the two links. */
export function TermsConsent({ className }: { className?: string }) {
  const { t } = useT();
  const links: Record<string, [string, MessageKey]> = { "\u0001": [TERMS_URL, "account.termsLink"], "\u0002": [PRIVACY_URL, "account.privacyLink"] };
  const parts = t("account.termsAgree", { terms: "\u0001", privacy: "\u0002" }).split(/(\u0001|\u0002)/);
  return (
    <p className={cn("text-center text-[10px] leading-snug text-white/50", className)}>
      {parts.map((p, i) =>
        links[p] ? (
          <a key={i} className="underline decoration-white/30 underline-offset-2 hover:text-white/80" href={links[p][0]} target="_blank" rel="noreferrer">
            {t(links[p][1])}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </p>
  );
}

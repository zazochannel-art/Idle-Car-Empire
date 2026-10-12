"use client";

// The player's account: the avatar button and save status in the top bar,
// the profile page, the sign-in and registration forms, and the choices the
// start of the game and a save conflict may ask for.
import { motion } from "framer-motion";
import { Cloud, CloudOff, History, KeyRound, LogIn, LogOut, Mail, RefreshCw, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { plantsOf } from "@/game/engine/chain";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
import { summarize, type AuthResult, type SaveSummary } from "@/game/save";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { answerStartChoice, enterGame, useCloud } from "@/store/cloud-store";
import { uiEvents } from "@/store/events";
import { useGame } from "@/store/game-store";
import { useUi } from "@/store/ui-store";
import { ViewHeader } from "../views/section-title";

type T = ReturnType<typeof useT>["t"];

export const AVATARS = ["🧑‍🔧", "👩‍🔧", "👨‍💼", "👩‍💼", "🧑‍🏭", "🦁", "🐺", "🦊", "🐯", "🦅", "🐻", "🐼", "🚗", "🏎️", "🏁", "👑"];

/** Where email links bring the player back: this page, without its hash. */
const here = () => window.location.href.split("#")[0];

const ago = (t: T, ms: number | null) => (ms ? t("account.ago", { time: formatDuration(Math.max(1, (Date.now() - ms) / 1000)) }) : "—");

function errorText(t: T, r: AuthResult): string {
  return r.ok ? "" : t(`account.err.${r.error}` as MessageKey);
}

// ───────────────────────── status ─────────────────────────

/** The save's state in a few words and a colour. */
export function useSaveStatus(): { text: string; tone: "ok" | "busy" | "warn" | "bad" | "local" } {
  const { t } = useT();
  const enabled = useCloud((c) => c.enabled);
  const mode = useCloud((c) => c.mode);
  const status = useCloud((c) => c.sync.status);
  if (!enabled || mode === "local") return { text: t("account.status.local"), tone: "local" };
  switch (status) {
    case "saving":
      return { text: t("account.status.saving"), tone: "busy" };
    case "saved":
      return { text: t("account.status.saved"), tone: "ok" };
    case "offline":
      return { text: t("account.status.offline"), tone: "warn" };
    case "error":
      return { text: t("account.status.error"), tone: "warn" };
    case "conflict":
      return { text: t("account.status.conflict"), tone: "bad" };
    default:
      return { text: t("account.status.idle"), tone: "ok" };
  }
}

const DOT = { ok: "bg-emerald-400", busy: "bg-sky-400 animate-pulse", warn: "bg-amber-400", bad: "bg-red-500 animate-pulse", local: "bg-white/40" };

/** The avatar in the top bar, with the save's state as a dot; opens the profile. */
export function ProfileButton() {
  const avatar = useCloud((c) => c.profile?.avatar ?? "👤");
  const { text, tone } = useSaveStatus();
  const setView = useUi((u) => u.setView);
  return (
    <button
      onClick={() => setView("profile")}
      title={text}
      aria-label={text}
      className="relative flex size-10 items-center justify-center rounded-full bg-[#5b5b60]/85 text-xl shadow-[0_3px_0_0_rgba(0,0,0,0.35)] backdrop-blur-md transition hover:brightness-110"
    >
      {avatar}
      <span className={cn("absolute bottom-0.5 right-0.5 size-3 rounded-full ring-2 ring-[#2b2b2e]", DOT[tone])} />
    </button>
  );
}

// ───────────────────────── forms ─────────────────────────

function Field({ label, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-white/60">{label}</span>
      <input {...rest} className="h-10 w-full rounded-xl bg-black/40 px-3 text-base text-white/90 ring-1 ring-white/10 outline-none focus:ring-electric/50" />
    </label>
  );
}

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/**
 * Sign in to an account (login), or, for a guest, register: the guest's
 * account gets the email and password, so its save stays the same.
 */
export function AccountForms({ initial, guest, onDone }: { initial: "login" | "register"; guest: boolean; onDone?: () => void }) {
  const saves = useGame((g) => g.saves);
  const { t } = useT();
  const [tab, setTab] = useState<"login" | "register">(guest ? initial : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  if (!saves) return null;

  const run = async (fn: () => Promise<AuthResult>, ok: (r: AuthResult) => string | null) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      if (r.ok) {
        const text = ok(r);
        if (text) setMsg({ text });
      } else setMsg({ text: errorText(t, r), bad: true });
    } catch {
      setMsg({ text: t("account.err.network"), bad: true });
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = validEmail(email) && password.length >= 6 && !busy;
  return (
    <div className="space-y-2.5">
      {guest && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/[0.07]">
          {(["register", "login"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={cn("rounded-lg py-1.5 text-[11px] font-black uppercase tracking-wide", tab === k ? "bg-gold text-black" : "text-white/60")}>
              {t(k === "register" ? "account.tab.register" : "account.tab.login")}
            </button>
          ))}
        </div>
      )}
      {tab === "register" && <p className="text-[11px] leading-snug text-white/55">{t("account.registerHint")}</p>}
      {tab === "login" && guest && <p className="text-[11px] leading-snug text-amber-300/90">{t("account.loginGuestWarn")}</p>}
      <Field label={t("account.email")} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field label={t("account.password")} type="password" autoComplete={tab === "register" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
      {tab === "register" ? (
        <Button
          variant="gold"
          className="w-full"
          disabled={!canSubmit}
          onClick={() =>
            run(
              () => saves.register(email.trim(), password, here()),
              (r) => {
                const account = saves.account;
                useCloud.setState({ account });
                void saves.profile().then((profile) => useCloud.setState({ profile }), () => {});
                onDone?.();
                return r.ok && r.pending ? t("account.registerPending", { email: email.trim() }) : t("account.registered");
              },
            )
          }
        >
          <UserPlus /> {t("account.register")}
        </Button>
      ) : (
        <>
          <Button
            variant="gold"
            className="w-full"
            disabled={!canSubmit}
            onClick={() =>
              run(
                () => saves.login(email.trim(), password),
                () => {
                  window.location.reload();
                  return t("account.loggingIn");
                },
              )
            }
          >
            <LogIn /> {t("account.login")}
          </Button>
          <Button size="sm" variant="ghost" className="w-full" disabled={!validEmail(email) || busy} onClick={() => run(() => saves.sendLink(email.trim(), here()), () => t("account.linkSent"))}>
            <Mail /> {t("account.sendLink")}
          </Button>
        </>
      )}
      {msg && <p className={cn("text-center text-xs", msg.bad ? "text-rose-300" : "text-sky-300")}>{msg.text}</p>}
    </div>
  );
}

// ───────────────────────── profile ─────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-2.5 py-2 ring-1 ring-white/[0.06]">
      <div className="text-[9px] font-bold uppercase tracking-wider text-white/45">{label}</div>
      <div className="truncate text-sm font-black tabular-nums">{value}</div>
    </div>
  );
}

function ProfileEditor() {
  const saves = useGame((g) => g.saves);
  const profile = useCloud((c) => c.profile);
  const { t } = useT();
  // (mounted again, with a fresh field, whenever the saved name changes)
  const [name, setName] = useState(profile?.username ?? "");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  if (!saves || !profile) return null;
  const save = async (p: { username?: string; avatar?: string; listed?: boolean }) => {
    setMsg(null);
    const r = await saves.updateProfile(p).catch(() => ({ ok: false as const, error: "network" as const }));
    if (!r.ok) return setMsg({ text: r.error === "taken" ? t("account.err.nameTaken") : r.error === "invalid" ? t("account.err.nameInvalid") : errorText(t, r), bad: true });
    useCloud.setState({ profile: { ...profile, ...p } });
    setMsg({ text: t("account.profileSaved") });
  };
  const trimmed = name.trim();
  const valid = trimmed.length >= 3 && trimmed.length <= 20;
  const listed = profile.listed !== false;
  return (
    <div className="space-y-2.5">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Field label={t("account.username")} value={name} maxLength={20} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
        </div>
        <Button size="sm" className="h-10" disabled={!valid || trimmed === profile.username} onClick={() => save({ username: trimmed })}>
          {t("account.saveName")}
        </Button>
      </div>
      <div>
        <div className="mb-1 text-[11px] font-semibold text-white/60">{t("account.avatar")}</div>
        <div className="grid grid-cols-8 gap-1">
          {AVATARS.map((a) => (
            <button key={a} onClick={() => save({ avatar: a })} className={cn("flex aspect-square items-center justify-center rounded-xl text-xl ring-1 transition", a === profile.avatar ? "bg-gold/25 ring-gold" : "bg-white/[0.04] ring-white/[0.07] hover:bg-white/[0.08]")}>
              {a}
            </button>
          ))}
        </div>
      </div>
      <button
        role="switch"
        aria-checked={listed}
        onClick={() => save({ listed: !listed })}
        className="flex w-full items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2.5 text-left ring-1 ring-white/10"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">🏆 {t("account.listed")}</span>
          <span className="block text-[11px] text-white/45">{t("account.listedHint")}</span>
        </span>
        <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition", listed ? "bg-emerald-500" : "bg-white/15")}>
          <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", listed ? "left-[1.125rem]" : "left-0.5")} />
        </span>
      </button>
      {msg && <p className={cn("text-center text-xs", msg.bad ? "text-rose-300" : "text-sky-300")}>{msg.text}</p>}
    </div>
  );
}

function PasswordForm() {
  const saves = useGame((g) => g.saves);
  const { t } = useT();
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  if (!saves) return null;
  return (
    <div className="space-y-2">
      <Field label={t("account.newPassword")} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      <Button
        size="sm"
        variant="secondary"
        className="w-full"
        disabled={pw.length < 6}
        onClick={async () => {
          const r = await saves.setPassword(pw).catch(() => ({ ok: false as const, error: "network" as const }));
          setMsg(r.ok ? { text: t("account.passwordSaved") } : { text: errorText(t, r), bad: true });
          if (r.ok) setPw("");
        }}
      >
        <KeyRound /> {t("account.setPassword")}
      </Button>
      {msg && <p className={cn("text-center text-xs", msg.bad ? "text-rose-300" : "text-sky-300")}>{msg.text}</p>}
    </div>
  );
}

export function ProfileView() {
  const enabled = useCloud((c) => c.enabled);
  const mode = useCloud((c) => c.mode);
  const account = useCloud((c) => c.account);
  const profile = useCloud((c) => c.profile);
  const sync = useCloud((c) => c.sync);
  const saves = useGame((g) => g.saves);
  const syncNow = useGame((g) => g.syncNow);
  const state = useGame((g) => g.state);
  const { t } = useT();
  const { text, tone } = useSaveStatus();
  const [switching, setSwitching] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);

  // the account as the server knows it now (an email confirmed in another tab)
  useEffect(() => {
    if (!saves?.account) return;
    void saves.refreshAccount().then((a) => a && useCloud.setState({ account: a }));
  }, [saves]);

  const plants = plantsOf(state);
  const levels = plants.reduce((a, [, b]) => a + b.level, 0);
  const name = profile?.username ?? t("account.player");
  return (
    <div className="space-y-4">
      <ViewHeader icon={profile?.avatar ?? "👤"} title={name} subtitle={state.brand?.name ? t("account.company", { name: state.brand.name }) : t("account.subtitle")} />

      {/* the company */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Stat label={t("account.stat.cash")} value={formatMoney(state.cash)} />
        <Stat label={t("account.stat.earned")} value={formatMoney(state.lifetime.moneyEarned)} />
        <Stat label={t("account.stat.plants")} value={`${formatNumber(plants.length)} · ${t("account.stat.levels", { n: formatNumber(levels) })}`} />
        <Stat label={t("account.stat.cars")} value={formatNumber(state.lifetime.carsProduced)} />
      </div>

      {/* the save */}
      <div className="space-y-2 rounded-2xl bg-[#2b2b2e] p-3 ring-1 ring-white/10">
        <div className="flex items-center gap-2 text-sm font-bold">
          {tone === "local" || tone === "warn" ? <CloudOff className="size-4 text-amber-300" /> : <Cloud className="size-4 text-sky-300" />}
          {t("account.cloudSave")}
          <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10px] font-black", tone === "ok" ? "bg-emerald-500/20 text-emerald-300" : tone === "busy" ? "bg-sky-500/20 text-sky-300" : tone === "bad" ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300")}>{text}</span>
        </div>
        {enabled && mode === "cloud" ? (
          <>
            <div className="text-[11px] text-white/55">
              {t("account.lastSaved")}: <span className="font-semibold text-white/80">{ago(t, sync.lastSaved)}</span> · {t("account.revision", { n: sync.revision })}
            </div>
            <Button size="sm" variant="secondary" className="w-full" disabled={sync.status === "saving" || sync.status === "conflict"} onClick={() => void syncNow()}>
              <RefreshCw /> {t("account.saveNow")}
            </Button>
          </>
        ) : (
          <p className="text-[11px] text-white/55">{enabled ? t("account.offlineHint") : t("account.noCloud")}</p>
        )}
      </div>

      <BackupsCard />

      {/* the account */}
      {enabled && account && (
        <div className="space-y-3 rounded-2xl bg-[#2b2b2e] p-3 ring-1 ring-white/10">
          <div className="text-sm font-bold">👤 {t("account.title")}</div>
          <div className="text-[11px] leading-snug text-white/60">
            {account.guest ? t("account.guestStatus") : t("account.signedIn", { email: account.email ?? "—" })}
            {account.pendingEmail && <div className="mt-1 text-amber-300">{t("account.pendingEmail", { email: account.pendingEmail })}</div>}
          </div>
          <ProfileEditor key={profile?.username ?? ""} />
          {account.guest ? (
            <AccountForms initial="register" guest />
          ) : (
            <>
              <PasswordForm />
              {switching ? (
                <AccountForms initial="login" guest={false} />
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setSwitching(true)}>
                    <LogIn /> {t("account.switch")}
                  </Button>
                  {confirmOut ? (
                    <Button
                      size="sm"
                      className="bg-none bg-rose-600 shadow-none"
                      onClick={async () => {
                        await saves?.logout();
                        window.location.reload();
                      }}
                    >
                      <LogOut /> {t("account.logoutConfirm")}
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setConfirmOut(true)}>
                      <LogOut /> {t("account.logout")}
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** The saves a choice replaced, kept on this device: any of them can be played again. */
function BackupsCard() {
  const saves = useGame((g) => g.saves);
  const restore = useGame((g) => g.restoreBackup);
  const { t } = useT();
  const [asking, setAsking] = useState<string | null>(null);
  // read once (they are large): again only after a restore
  const [list, setList] = useState(() => saves?.backups() ?? []);
  if (!list.length) return null;
  const from = (reason: string) => t(reason === "cloud" ? "account.backup.cloud" : reason === "replaced" ? "account.backup.replaced" : "account.backup.device");
  return (
    <div className="space-y-2 rounded-2xl bg-[#2b2b2e] p-3 ring-1 ring-white/10">
      <div className="flex items-center gap-2 text-sm font-bold">
        <History className="size-4 text-white/60" /> {t("account.backups")}
      </div>
      <p className="text-[11px] text-white/55">{t("account.backupsHint")}</p>
      {list.map((b) => (
        <div key={b.key} className="space-y-2 rounded-xl bg-white/[0.04] p-2.5 ring-1 ring-white/10">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-black">{b.summary.company || t("account.noCompany")}</div>
              <div className="text-[11px] text-white/55">
                {from(b.reason)} · {ago(t, b.at)}
              </div>
            </div>
            <div className="text-right text-[11px] text-white/70">
              <div>💰 {formatMoney(b.summary.cash)}</div>
              <div>
                🏭 {formatNumber(b.summary.plants)} · 🚗 {formatNumber(b.summary.cars)}
              </div>
            </div>
          </div>
          {asking === b.key ? (
            <>
              <p className="text-[11px] text-amber-300">{t("account.restoreConfirm")}</p>
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => setAsking(null)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  variant="gold"
                  onClick={() => {
                    const ok = restore(b.key);
                    setAsking(null);
                    setList(saves?.backups() ?? []);
                    uiEvents.emit({ type: "toast", tone: ok ? "success" : "warn", icon: ok ? "♻️" : "⚠️", title: t(ok ? "account.restored" : "account.err.unknown") });
                  }}
                >
                  {t("account.restoreYes")}
                </Button>
              </div>
            </>
          ) : (
            <Button size="sm" variant="secondary" className="w-full" onClick={() => setAsking(b.key)}>
              <History /> {t("account.restore")}
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

// ───────────────────────── choosing between two saves ─────────────────────────

function SaveCard({ title, s, onKeep, t }: { title: string; s: SaveSummary; onKeep: () => void; t: T }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white/[0.05] p-3 ring-1 ring-white/10">
      <div className="text-xs font-black uppercase tracking-wide text-white/60">{title}</div>
      <div className="truncate text-base font-black">{s.company || t("account.noCompany")}</div>
      <div className="grid grid-cols-2 gap-1 text-[11px] text-white/70">
        <span>💰 {formatMoney(s.cash)}</span>
        <span>📈 {formatMoney(s.earned)}</span>
        <span>🏭 {formatNumber(s.plants)}</span>
        <span>🚗 {formatNumber(s.cars)}</span>
      </div>
      <div className="text-[11px] text-white/50">{t("account.lastPlayed", { when: ago(t, s.lastPlayed || null) })}</div>
      <Button variant="gold" size="sm" onClick={onKeep}>
        {t("account.keepThis")}
      </Button>
    </div>
  );
}

/** Two different saves: the player keeps one (the other is backed up on this device). */
export function ChooseSave({ local, cloud, reason, onKeep }: { local: SaveSummary; cloud: SaveSummary; reason: "both-changed" | "different-games"; onKeep: (k: "local" | "cloud") => void }) {
  const { t } = useT();
  return (
    <div className="w-full max-w-lg space-y-3">
      <div className="text-center">
        <div className="text-lg font-black">{t("account.chooseTitle")}</div>
        <p className="mt-1 text-xs text-white/60">{t(reason === "both-changed" ? "account.chooseBoth" : "account.chooseDifferent")}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <SaveCard title={t("account.thisDevice")} s={local} onKeep={() => onKeep("local")} t={t} />
        <SaveCard title={t("account.cloudCopy")} s={cloud} onKeep={() => onKeep("cloud")} t={t} />
      </div>
      <p className="text-center text-[11px] text-white/45">{t("account.backupNote")}</p>
    </div>
  );
}

/** On the loading screen: what it is doing, or what it needs from the player. */
export function StartGate() {
  const phase = useCloud((c) => c.phase);
  const choice = useCloud((c) => c.startChoice);
  const welcome = useCloud((c) => c.welcome);
  const outdated = useCloud((c) => c.outdated);
  const { t } = useT();
  if (outdated)
    return (
      <div className="max-w-sm space-y-3 text-center">
        <p className="text-sm text-white/80">{t("account.outdated")}</p>
        <Button variant="gold" onClick={() => window.location.reload()}>
          <RefreshCw /> {t("account.reload")}
        </Button>
      </div>
    );
  if (choice) return <ChooseSave {...choice} onKeep={answerStartChoice} />;
  if (welcome) return <WelcomeGate returning={welcome === "returning"} />;
  return <div className="text-xs font-semibold text-white/45">{t(phase === "account" ? "account.loadingAccount" : "account.loadingSave")}</div>;
}

/** Before the game: create an account or sign in (or, at the bottom, play without one). */
function WelcomeGate({ returning }: { returning: boolean }) {
  const saves = useGame((g) => g.saves);
  const { t } = useT();
  const [tab, setTab] = useState<"register" | "login">(returning ? "login" : "register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  /** Registered, the email still to confirm: the game can start meanwhile. */
  const [pending, setPending] = useState<string | null>(null);
  if (!saves) return null;

  const nameOk = name.trim().length >= 3 && name.trim().length <= 20;
  const canSubmit = !busy && validEmail(email) && password.length >= 6 && (tab === "login" || nameOk);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch {
      setMsg({ text: t("account.err.network"), bad: true });
    } finally {
      setBusy(false);
    }
  };

  const submit = () =>
    run(async () => {
      if (tab === "register") {
        const r = await saves.welcomeRegister(name.trim(), email.trim(), password, here());
        if (!r.ok) return setMsg({ text: r.field === "name" ? t(r.error === "taken" ? "account.err.nameTaken" : r.error === "invalid" ? "account.err.nameInvalid" : "account.err.unknown") : errorText(t, r), bad: true });
        if (r.pending) return setPending(email.trim());
      } else {
        const r = await saves.welcomeLogin(email.trim(), password);
        if (!r.ok) return setMsg({ text: errorText(t, r), bad: true });
      }
      enterGame("account");
    });

  const card = "w-full max-w-sm space-y-3 rounded-2xl bg-[#2b2b2e] p-4 ring-1 ring-white/10";
  if (pending)
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn(card, "text-center")}>
        <div className="text-3xl">📬</div>
        <div className="text-lg font-black">{t("welcome.pendingTitle")}</div>
        <p className="text-xs leading-snug text-white/65">{t("welcome.pendingBody", { email: pending })}</p>
        <Button variant="gold" className="w-full" onClick={() => enterGame("account")}>
          {t("welcome.enter")}
        </Button>
      </motion.div>
    );

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={card}>
      <div className="text-center">
        <div className="text-lg font-black leading-tight">{t(returning ? "account.welcomeBack" : "welcome.title")}</div>
        <p className="mt-1 text-[11px] leading-snug text-white/60">{t("welcome.subtitle")}</p>
        <div className="mt-2 flex justify-center gap-3 text-[10px] font-bold text-white/55">
          <span>☁️ {t("welcome.perkCloud")}</span>
          <span>📱 {t("welcome.perkDevices")}</span>
          <span>🏁 {t("welcome.perkName")}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/[0.07]">
        {(["register", "login"] as const).map((k) => (
          <button
            key={k}
            onClick={() => {
              setTab(k);
              setMsg(null);
            }}
            className={cn("rounded-lg py-1.5 text-[11px] font-black uppercase tracking-wide", tab === k ? "bg-gold text-black" : "text-white/60")}
          >
            {t(k === "register" ? "account.tab.register" : "account.tab.login")}
          </button>
        ))}
      </div>
      <form
        className="space-y-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) void submit();
        }}
      >
        {tab === "register" && <Field label={t("account.username")} autoComplete="nickname" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />}
        <Field label={t("account.email")} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label={t("account.password")} type="password" autoComplete={tab === "register" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" variant="gold" className="w-full" disabled={!canSubmit}>
          {tab === "register" ? (
            <>
              <UserPlus /> {t("welcome.start")}
            </>
          ) : (
            <>
              <LogIn /> {t("account.login")}
            </>
          )}
        </Button>
      </form>
      {tab === "login" && (
        <Button
          size="sm"
          variant="ghost"
          className="w-full"
          disabled={!validEmail(email) || busy}
          onClick={() =>
            run(async () => {
              const r = await saves.sendLink(email.trim(), here());
              setMsg(r.ok ? { text: t("account.linkSent") } : { text: errorText(t, r), bad: true });
            })
          }
        >
          <Mail /> {t("account.sendLink")}
        </Button>
      )}
      {msg && <p className={cn("text-center text-xs", msg.bad ? "text-rose-300" : "text-sky-300")}>{msg.text}</p>}
      <div className="border-t border-white/10 pt-2.5 text-center">
        <button className="text-[11px] font-bold text-white/55 underline-offset-2 hover:text-white/80 hover:underline" disabled={busy} onClick={() => enterGame("guest")}>
          {t("welcome.noAccount")}
        </button>
        <p className="mt-0.5 text-[10px] leading-snug text-white/35">{t("welcome.noAccountHint")}</p>
      </div>
    </motion.div>
  );
}

/** During play: the account's save changed on another device too. */
export function ConflictDialog() {
  const status = useCloud((c) => c.sync.status);
  const saves = useGame((g) => g.saves);
  const resolve = useGame((g) => g.resolveConflict);
  const state = useGame((g) => g.state);
  const [cloud, setCloud] = useState<SaveSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const open = status === "conflict";
  const { t } = useT();
  useEffect(() => {
    if (!open || !saves) return;
    void saves.peekCloud().then((c) => setCloud(c?.state ? summarize(c.state) : null));
  }, [open, saves]);
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent>
        <DialogTitle>{t("account.conflictTitle")}</DialogTitle>
        <DialogDescription className="mt-1">{t("account.conflictBody")}</DialogDescription>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <SaveCard
            title={t("account.thisDevice")}
            s={summarize(state)}
            t={t}
            onKeep={async () => {
              if (busy) return;
              setBusy(true);
              await resolve("local").finally(() => setBusy(false));
            }}
          />
          {cloud ? (
            <SaveCard
              title={t("account.cloudCopy")}
              s={cloud}
              t={t}
              onKeep={async () => {
                if (busy) return;
                setBusy(true);
                await resolve("cloud").finally(() => setBusy(false));
              }}
            />
          ) : (
            <div className="flex items-center justify-center rounded-2xl bg-white/[0.03] p-3 text-xs text-white/50">{t("account.loadingSave")}</div>
          )}
        </div>
        <p className="mt-2 text-center text-[11px] text-white/45">{t("account.backupNote")}</p>
      </DialogContent>
    </Dialog>
  );
}

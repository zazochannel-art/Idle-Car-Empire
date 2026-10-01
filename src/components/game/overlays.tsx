"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Clock, Download, RotateCcw, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatDuration, formatMoney, formatNumber } from "@/game/format";
import { cn } from "@/lib/utils";
import { uiEvents, type UiEvent } from "@/store/events";
import { useGame } from "@/store/game-store";

/** "Welcome Back!" — shown while an offline report is waiting to be collected. */
export function OfflineDialog() {
  const report = useGame((g) => g.state.pendingOffline);
  const collect = useGame((g) => g.collectOffline);
  const offlineCap = useGame((g) => g.snap.gm.offlineCapHours);
  if (!report) return null;
  const capped = report.seconds > report.cappedSeconds + 1;

  return (
    <Dialog open onOpenChange={(o) => !o && collect()}>
      <DialogContent hideClose className="text-center">
        <motion.div initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 14 }} className="mx-auto mb-2 text-6xl">
          🏭
        </motion.div>
        <DialogTitle className="text-2xl">Welcome Back!</DialogTitle>
        <DialogDescription className="mt-1">Your factories kept working while you were away.</DialogDescription>

        <div className="mt-5 grid grid-cols-2 gap-2 text-left">
          <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/45">
              <Clock className="size-3" /> Offline time
            </div>
            <div className="mt-1 text-lg font-bold tabular-nums">{formatDuration(report.seconds)}</div>
          </div>
          <div className="rounded-2xl bg-white/[0.04] p-3 ring-1 ring-white/[0.07]">
            <div className="text-[11px] uppercase tracking-wider text-white/45">Cars produced</div>
            <div className="mt-1 text-lg font-bold tabular-nums">{formatNumber(report.cars)}</div>
          </div>
        </div>
        <div className="mt-2 rounded-2xl bg-gradient-to-br from-gold/15 to-transparent p-4 ring-1 ring-gold/30">
          <div className="text-[11px] uppercase tracking-wider text-gold/70">Money earned</div>
          <div className="text-3xl font-black tabular-nums text-gradient-gold">{formatMoney(report.money)}</div>
          {report.rp > 0 && <div className="text-xs text-violet-300">+{formatNumber(report.rp)} research points</div>}
        </div>
        {capped && <p className="mt-2 text-[11px] text-white/40">Offline earnings are capped at {offlineCap}h. Research AI Factory and Empire perks to extend it.</p>}

        <Button variant="gold" size="lg" className="mt-5 w-full text-base" onClick={collect}>
          COLLECT {formatMoney(report.money)}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

interface Toast {
  id: number;
  tone: "success" | "gold" | "info";
  title: string;
  body?: string;
  icon?: string;
}
let toastId = 0;

export function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(
    () =>
      uiEvents.on((e: UiEvent) => {
        if (e.type !== "toast") return;
        const t = { id: ++toastId, tone: e.tone, title: e.title, body: e.body, icon: e.icon };
        setToasts((list) => [...list.slice(-3), t]);
        setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), 3800);
      }),
    [],
  );

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+7.5rem)] z-[45] flex flex-col items-center gap-2 px-3 md:top-20 md:items-end md:pr-6">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
            className={cn(
              "glass-strong pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl p-3",
              t.tone === "gold" && "ring-1 ring-gold/40",
              t.tone === "success" && "ring-1 ring-emerald-400/30",
              t.tone === "info" && "ring-1 ring-electric/30",
            )}
          >
            {t.icon && <span className="text-2xl">{t.icon}</span>}
            <div className="min-w-0">
              <div className={cn("text-sm font-semibold", t.tone === "gold" && "text-gold")}>{t.title}</div>
              {t.body && <div className="truncate text-xs text-white/55">{t.body}</div>}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Full-screen celebration after a Global Expansion. */
export function PrestigeOverlay() {
  const [points, setPoints] = useState<number | null>(null);
  useEffect(
    () =>
      uiEvents.on((e) => {
        if (e.type !== "prestige") return;
        setPoints(e.points);
        setTimeout(() => setPoints(null), 2600);
      }),
    [],
  );

  return (
    <AnimatePresence>
      {points !== null && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setPoints(null)}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: [0.3, 1.15, 1], opacity: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-center"
          >
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }} className="mx-auto text-8xl">
              🌍
            </motion.div>
            <div className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-gold/80">Global Expansion</div>
            <div className="mt-1 text-5xl font-black text-gradient-gold">+{formatNumber(points)} ⭐</div>
            <div className="mt-2 text-sm text-white/60">Your empire restarts stronger.</div>
          </motion.div>
          {Array.from({ length: 18 }).map((_, i) => (
            <motion.span
              key={i}
              className="absolute text-2xl"
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{ x: Math.cos((i / 18) * Math.PI * 2) * 260, y: Math.sin((i / 18) * Math.PI * 2) * 260, opacity: 0 }}
              transition={{ duration: 1.4, ease: "easeOut" }}
            >
              ⭐
            </motion.span>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { exportSave, importSave, resetGame, backend } = useGame.getState();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setMsg(null);
          setConfirmReset(false);
        }
      }}
    >
      <DialogContent>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription className="mt-1">Progress saves automatically every few seconds ({backend}).</DialogDescription>

        <div className="mt-4 space-y-2">
          <Button
            variant="secondary"
            className="w-full"
            onClick={async () => {
              const code = exportSave();
              setText(code);
              try {
                await navigator.clipboard.writeText(code);
                setMsg("Save code copied to clipboard.");
              } catch {
                setMsg("Copy the save code below.");
              }
            }}
          >
            <Download /> Export save
          </Button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a save code here to import it"
            className="h-24 w-full resize-none rounded-xl bg-black/40 p-3 font-mono text-[11px] text-white/80 ring-1 ring-white/10 outline-none focus:ring-electric/50"
          />
          <Button
            variant="secondary"
            className="w-full"
            disabled={!text.trim()}
            onClick={() => setMsg(importSave(text) ? "Save imported." : "That save code is not valid.")}
          >
            <Upload /> Import save
          </Button>
          {msg && <p className="text-center text-xs text-sky-300">{msg}</p>}
        </div>

        <div className="mt-5 border-t border-white/10 pt-4">
          {confirmReset ? (
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-none bg-rose-600 shadow-none"
                onClick={async () => {
                  await resetGame();
                  setConfirmReset(false);
                  onOpenChange(false);
                }}
              >
                Erase everything
              </Button>
            </div>
          ) : (
            <Button variant="ghost" className="w-full text-rose-300" onClick={() => setConfirmReset(true)}>
              <RotateCcw /> Reset game
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

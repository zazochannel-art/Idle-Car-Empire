"use client";

import { RefreshCw } from "lucide-react";
import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import { reportError } from "@/lib/errors";
import { useGame } from "@/store/game-store";

/** A screen's code, tried once more after a moment when the first try fails (a dropped connection). */
export function retry<T>(load: () => Promise<T>): Promise<T> {
  return load().catch(() => new Promise<T>((resolve, reject) => setTimeout(() => load().then(resolve, reject), 1500)));
}

const RELOADED = "idle-car-empire:reloaded-for-update";

/** The error of a screen whose code didn't arrive (rather than a bug in the screen itself). */
const missingCode = (e: unknown) => /chunk|module|import|fetch|load/i.test(`${(e as Error)?.name} ${(e as Error)?.message}`);

/**
 * The web game was updated while it was open: the old version's files are gone from the site, so
 * a screen it hadn't loaded yet can't load. Reloading (once per session, the game saved first)
 * brings the current version. Offline, it would only bring the same page back: not then.
 */
function reloadForUpdate() {
  try {
    if (!navigator.onLine || sessionStorage.getItem(RELOADED)) return false;
    sessionStorage.setItem(RELOADED, String(Date.now()));
  } catch {
    return false;
  }
  useGame.getState().suspend();
  window.location.reload();
  return true;
}

/**
 * Around an on-demand screen: if it can't be shown, the game goes on (the map stays) and the
 * player sees why, instead of a blank page.
 */
export class ScreenBoundary extends Component<{ children: ReactNode; onClose: () => void }, { failed: boolean; closed: boolean }> {
  state = { failed: false, closed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // reported either way: in the app a screen's code is on the phone, so even one that didn't load is worth knowing about
    reportError(error, "screen");
    if (missingCode(error)) reloadForUpdate();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    // closed: nothing, while the screen's slot animates away (a fresh boundary comes with the next screen)
    if (this.state.closed) return null;
    return (
      <ScreenFailed
        onClose={() => {
          this.setState({ closed: true });
          this.props.onClose();
        }}
      />
    );
  }
}

function ScreenFailed({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="alert" data-screen-failed>
      <div className="glass-strong w-full max-w-sm space-y-3 rounded-2xl p-4 text-center">
        <p className="text-sm text-white/80">{t("screen.failed")}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.back")}
          </Button>
          <Button
            variant="gold"
            onClick={() => {
              useGame.getState().suspend();
              window.location.reload();
            }}
          >
            <RefreshCw /> {t("screen.reload")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Whether a dialog is on screen. One already closing doesn't count.

const DIALOG = '[role="dialog"]:not([data-state="closed"]), [role="alertdialog"]:not([data-state="closed"])';

/** The game's dialogs and sheets (Radix) and its animated cards with a dialog role (unlock, staff, recall, poach); null outside a browser. */
export function openDialog(): Element | null {
  if (typeof document === "undefined") return null;
  return document.querySelector(DIALOG);
}

/** Any dialog, or a card that asks the player something without a dialog role (the company name): nothing a full-screen ad may cover. */
export function modalOnScreen(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.querySelector(`${DIALOG}, [data-modal]`);
}

import { useRef } from "react";

/**
 * Hands focus back to whatever opened a Radix dialog.
 *
 * Radix restores focus to `Dialog.Trigger` on close. These modals are driven by
 * an `isOpen` prop flipped from call sites scattered across the page, so there
 * is no `Dialog.Trigger` for Radix to restore to and it drops focus onto
 * <body> — a keyboard user pressing Escape lands at the top of the document
 * and has to tab back from the start (WCAG 2.4.3).
 *
 * `Dialog.Trigger` is not an option here because several of these modals are
 * opened from more than one button, so the element to restore to is only known
 * at runtime.
 *
 * The capture runs during render rather than in an effect on purpose: React
 * flushes child effects before parent effects, so Radix's focus move (inside
 * Dialog.Content, a child) would already have happened and an effect here would
 * capture an element *inside* the dialog instead of the trigger.
 *
 * @param isOpen whether the dialog is currently open
 * @returns an `onCloseAutoFocus` handler for `Dialog.Content`
 */
export function useFocusRestore(isOpen: boolean) {
  const triggerRef = useRef<HTMLElement | null>(null);

  if (isOpen && !triggerRef.current) {
    triggerRef.current = document.activeElement as HTMLElement | null;
  }

  return (event: Event) => {
    const trigger = triggerRef.current;
    triggerRef.current = null;

    // The trigger can be gone by the time we close — e.g. EditItemModal is
    // opened from a popover that the same click tears down. Focusing a detached
    // node silently does nothing, so only suppress Radix's default when we
    // actually have somewhere to put focus. Otherwise let Radix decide rather
    // than swallow the event and leave focus wherever it happened to land.
    if (!trigger?.isConnected) return;

    event.preventDefault();
    trigger.focus();
  };
}

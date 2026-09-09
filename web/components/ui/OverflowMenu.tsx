"use client";

/**
 * The `•••` menu on a résumé card.
 *
 * Replaces the row of permanent Preview / Rename / Delete buttons, which put a destructive
 * action one mis-click from a card the user was only trying to open.
 *
 * The behaviour that makes it a menu rather than a popover:
 *
 * - **Escape closes it** and returns focus to the trigger, so a keyboard user is never
 *   stranded inside a menu they cannot leave.
 * - **A click anywhere else closes it**, listening on `pointerdown` rather than `click`, or
 *   the same press that opens one menu would close it again on the way back up.
 * - **Arrow keys move between items**, which is what `role="menu"` promises. Announcing a
 *   menu that only responds to Tab is worse than not announcing one.
 * - **Nothing renders while closed**, so the actions are out of the accessibility tree.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { MoreIcon } from "@/components/icons";

export interface OverflowAction {
  label: string;
  onSelect: () => void;
  /** Destructive actions take the rose treatment and sit last, behind a divider. */
  destructive?: boolean;
  icon?: React.ReactNode;
}

export function OverflowMenu({
  actions,
  label,
}: {
  actions: OverflowAction[];
  /** The accessible name, e.g. "Actions for Software Engineer, master". */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (list.current?.contains(target) || trigger.current?.contains(target)) return;
      // No focus restore: the user is on their way somewhere else, and yanking focus back to
      // the trigger would fight the click they just made.
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

      event.preventDefault();
      const items = [...(list.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [])];
      if (items.length === 0) return;

      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        event.key === "ArrowDown"
          ? items[(at + 1 + items.length) % items.length]
          : items[(at - 1 + items.length) % items.length];
      next?.focus();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return (
    <span className="overflow-menu">
      <button
        ref={trigger}
        type="button"
        className="overflow-menu__trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          // The card behind this is itself a click target that opens the preview.
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <MoreIcon />
      </button>

      {open && (
        <div ref={list} id={menuId} className="overflow-menu__list" role="menu" aria-label={label}>
          {actions.map((action, index) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className="overflow-menu__item"
              data-destructive={action.destructive || undefined}
              // Focus the first item on open, which is what makes the arrow keys usable
              // without a Tab press first.
              autoFocus={index === 0}
              onClick={(event) => {
                event.stopPropagation();
                close(false);
                action.onSelect();
              }}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

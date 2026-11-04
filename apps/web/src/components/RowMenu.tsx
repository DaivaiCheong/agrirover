import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ChevronDown, type LucideIcon } from "lucide-react";

export type MenuItem = { label: string; icon: LucideIcon; danger?: boolean } & ({ to: string } | { onSelect: () => void });
export type MenuEntry = MenuItem | "separator";

/**
 * One "Actions" button per table row. Opening it lists the actions one under another, like an ERP
 * row menu. The list is drawn in the page body, so a table panel can't clip it.
 * It closes on a choice, on a click outside, on Escape, and when the page scrolls.
 */
export default function RowMenu({ items, label = "Actions" }: { items: (MenuEntry | false | null)[]; label?: string }) {
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const WIDTH = 216;

  // under the button, lined up with its right edge, but kept inside the screen on a phone
  function toggle() {
    if (pos) return setPos(null);
    const r = button.current!.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.right - WIDTH), window.innerWidth - WIDTH - 8);
    setPos({ top: r.bottom + 6, left });
  }

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const outside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menu.current?.contains(t) || button.current?.contains(t)) return;
      setPos(null);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setPos(null); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  const entries = items.filter((x): x is MenuEntry => Boolean(x));

  return (
    <>
      <button ref={button} className="btn btn-sm btn-ghost" aria-haspopup="menu" aria-expanded={pos !== null} onClick={toggle}>
        {label}<ChevronDown size={15} aria-hidden />
      </button>
      {pos && createPortal(
        <div ref={menu} role="menu" className="menu" style={{ top: pos.top, left: pos.left, width: 216 }}>
          {entries.map((e, i) => {
            if (e === "separator") return <div key={i} className="menu-sep" role="separator" />;
            const cls = `menu-item${e.danger ? " menu-item-danger" : ""}`;
            const inner = <><e.icon size={16} aria-hidden />{e.label}</>;
            return "to" in e
              ? <Link key={i} role="menuitem" to={e.to} className={cls} onClick={() => setPos(null)}>{inner}</Link>
              : <button key={i} role="menuitem" className={cls} onClick={() => { setPos(null); e.onSelect(); }}>{inner}</button>;
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

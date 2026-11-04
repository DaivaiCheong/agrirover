import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { BRAND } from "../lib/brand";
import {
  Calculator, Camera, ChartColumn, Cpu, Leaf, MapPin, Package, Receipt, Scale, Settings, Sprout, Sun, Tractor, Wallet, Wheat,
  Wrench, type LucideIcon,
} from "lucide-react";

type Tab = { to: string; label: string; icon: LucideIcon };

/** The five places a farmer goes. Everything else is a tab inside one of them. */
export const SECTIONS = {
  today:   { to: "/",         label: "Today",    icon: Sun,         title: "Today", sub: "", tabs: [] as Tab[] },
  crops:   { to: "/cycles",   label: "My crops", icon: Sprout,      title: "My crops", sub: "", tabs: [] as Tab[] },
  money:   { to: "/costs",    label: "Money",    icon: Wallet,      title: "Money",
             sub: "Everything you spend, and what you keep in the shed.",
             tabs: [{ to: "/costs", label: "Costs", icon: Receipt }, { to: "/stock", label: "Stock", icon: Package },
                    { to: "/equipment", label: "Equipment", icon: Wrench }] },
  results: { to: "/cop",      label: "Results",  icon: ChartColumn, title: "Results",
             sub: "What each kilo really costs you, and what you earn from it.",
             tabs: [{ to: "/cop", label: "Cost of production", icon: Calculator },
                    { to: "/harvest", label: "Harvest and sales", icon: Wheat },
                    { to: "/compare", label: "Compare beds", icon: Scale }] },
  farm:    { to: "/beds",     label: "Farm",     icon: Tractor,     title: "Farm",
             sub: "Your land, beds, equipment, devices, and farm configuration.",
             tabs: [{ to: "/beds", label: "Beds & Land", icon: MapPin },
                    { to: "/settings", label: "Settings", icon: Settings },
                    { to: "/devices", label: "Devices", icon: Cpu },
                    { to: "/crop", label: "Disease check", icon: Camera }] },
} as const;

export type SectionKey = keyof typeof SECTIONS;

/** Which of the five places a path belongs to. A crop's cost report belongs to Results. */
export function sectionOf(path: string): SectionKey {
  if (path === "/") return "today";
  if (/^\/cycles\/[^/]+/.test(path)) return "results";
  if (path.startsWith("/cycles") || path.startsWith("/plan")) return "crops";
  for (const key of ["money", "results", "farm"] as const) {
    if (SECTIONS[key].tabs.some((t) => path === t.to || path.startsWith(`${t.to}/`))) return key;
  }
  return "today";
}

export default function Shell({ children }: { children: ReactNode }) {
  const here = sectionOf(useLocation().pathname);
  const items = Object.entries(SECTIONS) as [SectionKey, (typeof SECTIONS)[SectionKey]][];
  return (
    <div className="shell">
      <aside className="side">
        <div className="brandmark">
          <div className="brand-tile"><Leaf size={21} aria-hidden /></div>
          <div className="brand">{BRAND.name}<small>{BRAND.tagline}</small></div>
        </div>
        <nav className="side-nav" aria-label="Main">
          {items.map(([key, s]) => (
            <Link key={key} to={s.to} className={`side-link${here === key ? " side-on" : ""}`}
                  aria-current={here === key ? "page" : undefined}>
              <s.icon size={22} aria-hidden />{s.label}
            </Link>
          ))}
        </nav>
        <p className="side-foot">One farm. No login yet: anyone with this address can see and change the data.</p>
      </aside>
      <div className="content">{children}</div>
      <nav className="bottomnav" aria-label="Main">
        {items.map(([key, s]) => (
          <Link key={key} to={s.to} className={`bn${here === key ? " bn-on" : ""}`}
                aria-current={here === key ? "page" : undefined}>
            <s.icon size={22} aria-hidden />{s.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { BRAND } from "../lib/brand";
import {
  BookOpen, Bot, CalendarDays, Calculator, Camera, Cpu, History, Leaf, MapPin, Package, Scale, Settings,
  Sprout, Sun, Tractor, Wallet, Wheat, Wrench, type LucideIcon,
} from "lucide-react";

type Tab = { to: string; label: string; icon: LucideIcon };

/** The seven places a farmer goes. Everything else is a tab inside one of them. */
export const SECTIONS = {
  today:   { to: "/",         label: "Today",    icon: Sun,         title: "Today", tabs: [] as Tab[] },
  plan:    { to: "/plan",     label: "Plan",     icon: CalendarDays, title: "Plan", tabs: [] as Tab[] },
  rover:   { to: "/rover",    label: "Rover",    icon: Bot,         title: "Rover",
             tabs: [{ to: "/rover", label: "Today", icon: Sprout },
                    { to: "/rover/history", label: "History", icon: History }] },
  health:  { to: "/crop",     label: "Health",   icon: Camera,      title: "Tomato Vision & Plant Health",
             tabs: [{ to: "/crop", label: "Rover Vision Gallery", icon: Camera },
                    { to: "/guide", label: "Tomato Disease & Treatment Guide", icon: BookOpen }] },
  crops:   { to: "/cycles",   label: "Crops",    icon: Sprout,      title: "My crops", tabs: [] as Tab[] },
  finance: { to: "/finance",  label: "Finance",  icon: Wallet,      title: "Tomato Unit Economics & Finance",
             tabs: [{ to: "/finance", label: "Unit Cost & Savings", icon: Calculator },
                    { to: "/cop", label: "Block Breakdown (G1–G6)", icon: Scale },
                    { to: "/harvest", label: "Harvest & Revenue", icon: Wheat }] },
  farm:    { to: "/beds",     label: "Farm",     icon: Tractor,     title: "Farm",
             tabs: [{ to: "/beds", label: "Beds & Land", icon: MapPin },
                    { to: "/stock", label: "Water & Input Stock", icon: Package },
                    { to: "/equipment", label: "Equipment", icon: Wrench },
                    { to: "/devices", label: "Devices", icon: Cpu },
                    { to: "/settings", label: "Settings", icon: Settings }] },
} as const;

export type SectionKey = keyof typeof SECTIONS;

/** Which place a path belongs to. A crop's cost report belongs to Finance. */
export function sectionOf(path: string): SectionKey {
  if (path === "/") return "today";
  if (path === "/plan") return "plan";
  if (/^\/cycles\/[^/]+$/.test(path)) return "finance";
  if (path.startsWith("/cycles")) return "crops";
  for (const key of ["rover", "health", "finance", "farm"] as const) {
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
          <div className="brand">{BRAND.name}</div>
        </div>
        <nav className="side-nav" aria-label="Main">
          {items.map(([key, s]) => (
            <Link key={key} to={s.to} className={`side-link${here === key ? " side-on" : ""}`}
                  aria-current={here === key ? "page" : undefined}>
              <s.icon size={18} aria-hidden />{s.label}
            </Link>
          ))}
        </nav>
        <p className="side-foot">No login yet: anyone with this address can change the data.</p>
      </aside>
      <div className="content">
        {children}
      </div>
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

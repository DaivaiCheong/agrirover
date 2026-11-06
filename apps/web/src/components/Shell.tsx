import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { BRAND } from "../lib/brand";
import {
  BookOpen, Bot, CalendarDays, Calculator, Camera, ChartColumn, ClipboardList, Cpu, History, Images, Info, Leaf, MapPin, Package, Receipt, Scale, Settings,
  Sprout, Sun, Tractor, TrendingUp, Wallet, Wheat, Wrench, type LucideIcon,
} from "lucide-react";

type Tab = { to: string; label: string; icon: LucideIcon };

/** The seven places a farmer goes. Everything else is a tab inside one of them. */
export const SECTIONS = {
  today:   { to: "/",         label: "Today",    icon: Sun,         title: "Today", tabs: [] as Tab[] },
  plan:    { to: "/plan",     label: "Plan",     icon: CalendarDays, title: "Plan", tabs: [] as Tab[] },
  rover:   { to: "/rover",    label: "Rover",    icon: Bot,         title: "Rover",
             tabs: [{ to: "/rover", label: "Daily round", icon: Bot }, { to: "/rover/about", label: "What it does", icon: Info },
                    { to: "/rover/growth", label: "Growth", icon: TrendingUp }, { to: "/rover/sop", label: "SOP", icon: ClipboardList },
                    { to: "/rover/history", label: "History", icon: History }] },
  health:  { to: "/crop",     label: "Health",   icon: Camera,      title: "Plant health",
             tabs: [{ to: "/crop", label: "Check a photo", icon: Camera }, { to: "/leaf-tests", label: "Leaf tests", icon: Leaf },
                    { to: "/guide", label: "Disease guide", icon: BookOpen },
                    { to: "/photos", label: "Photo library", icon: Images }] },
  crops:   { to: "/cycles",   label: "Crops",    icon: Sprout,      title: "My crops", tabs: [] as Tab[] },
  finance: { to: "/finance",  label: "Finance",  icon: Wallet,      title: "Finance",
             tabs: [{ to: "/finance", label: "Overview", icon: ChartColumn }, { to: "/costs", label: "Costs", icon: Receipt },
                    { to: "/harvest", label: "Harvest and sales", icon: Wheat },
                    { to: "/cop", label: "Cost of production", icon: Calculator },
                    { to: "/compare", label: "Compare blocks", icon: Scale }] },
  farm:    { to: "/beds",     label: "Farm",     icon: Tractor,     title: "Farm",
             tabs: [{ to: "/beds", label: "Beds & Land", icon: MapPin },
                    { to: "/stock", label: "Stock", icon: Package },
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

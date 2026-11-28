import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient, useIsFetching } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen, Bot, Box, CalendarDays, CalendarRange, Calculator, Camera, ChevronRight, ClipboardCheck, ClipboardList, Cpu,
  FlaskConical, GitCompare, History, Images, Info, Leaf, MapPin, Package, Play, Plus, ReceiptText, RefreshCw, Scale, Search,
  Settings, SlidersHorizontal, Sparkles, Sprout, Sun, Tractor, TrendingUp, Wallet, Wheat, Wrench, type LucideIcon,
} from "lucide-react";
import { BRAND } from "../lib/brand";
import { dayMonthYear } from "../lib/format";
import { noteRoundState, useStatus, useZones } from "../lib/queries";
import { dismiss, useToasts } from "../lib/toast";
import { PageSkeleton } from "./ui";

type Tab = { to: string; label: string; icon: LucideIcon };

export const SECTIONS = {
  today:   { to: "/",         label: "Today",   icon: Sun,          title: "Today",   tabs: [] as Tab[] },
  plan:    { to: "/plan",     label: "Plan",    icon: CalendarDays, title: "Plan",    tabs: [] as Tab[] },
  rover:   { to: "/rover",    label: "Rover",   icon: Bot,          title: "Rover",
             tabs: [{ to: "/rover", label: "Block view", icon: Box },
                    { to: "/rover/soil", label: "Soil", icon: Leaf },
                    { to: "/rover/history", label: "History", icon: History },
                    { to: "/rover/days", label: "Day by day", icon: CalendarRange },
                    { to: "/rover/setup", label: "Setup", icon: SlidersHorizontal },
                    { to: "/rover/advice", label: "Advice", icon: ClipboardCheck },
                    { to: "/rover/round", label: "Round", icon: Play },
                    { to: "/rover/plants", label: "Plants", icon: Sprout },
                    { to: "/rover/about", label: "What it does", icon: Info },
                    { to: "/rover/growth", label: "Growth", icon: TrendingUp },
                    { to: "/rover/sop", label: "SOP", icon: ClipboardList },
                    { to: "/rover/test", label: "Test", icon: Wrench }] },
  health:  { to: "/crop",     label: "Health",  icon: Camera,       title: "Plant health",
             tabs: [{ to: "/crop", label: "Plant gallery", icon: Camera },
                    { to: "/photos", label: "Photos", icon: Images },
                    { to: "/leaf-tests", label: "Leaf tests", icon: FlaskConical },
                    { to: "/guide", label: "Disease guide", icon: BookOpen }] },
  crops:   { to: "/cycles",   label: "Crops",   icon: Sprout,       title: "Crops",   tabs: [] as Tab[] },
  finance: { to: "/finance",  label: "Finance", icon: Wallet,       title: "Finance",
             tabs: [{ to: "/finance", label: "Unit cost", icon: Calculator },
                    { to: "/costs", label: "Cost ledger", icon: ReceiptText },
                    { to: "/cop", label: "By block", icon: Scale },
                    { to: "/harvest", label: "Harvest & sales", icon: Wheat },
                    { to: "/compare", label: "Compare crops", icon: GitCompare }] },
  farm:    { to: "/beds",     label: "Farm",    icon: Tractor,      title: "Farm",
             tabs: [{ to: "/beds", label: "Beds & soil", icon: MapPin },
                    { to: "/stock", label: "Stock", icon: Package },
                    { to: "/equipment", label: "Equipment", icon: Wrench },
                    { to: "/devices", label: "Devices", icon: Cpu },
                    { to: "/settings", label: "Settings", icon: Settings }] },
} as const;

export type SectionKey = keyof typeof SECTIONS;

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

function tabOf(path: string, key: SectionKey): Tab | undefined {
  const tabs = SECTIONS[key].tabs as readonly Tab[];
  return [...tabs].sort((a, b) => b.to.length - a.to.length).find((t) => path === t.to || path.startsWith(`${t.to}/`));
}

type Light = "ok" | "warn" | "alert" | "idle";
const Dot = ({ kind }: { kind: Light }) => <i className={`dot dot-${kind}`} aria-hidden />;

function StatusPills() {
  const qc = useQueryClient();
  const status = useStatus();
  const zones = useZones();
  const s = status.data;
  const m = s?.mission;
  const label = zones.data?.find((z) => z.zone === m?.zoneId)?.label ?? m?.zoneId ?? undefined;

  useEffect(() => {
    noteRoundState(qc, m?.missionId, m?.status, label);
  }, [qc, m?.missionId, m?.status, label]);

  if (status.isPending) return <span className="pill"><Dot kind="idle" />Connecting…</span>;
  if (status.error || !s) {
    return (
      <span className="pill pill-alert" title="The dashboard cannot reach the API at /api/v1. Start it, then this turns green.">
        <Dot kind="alert" />Farm server offline
      </span>
    );
  }
  const rover = s.rover;
  const going = m && (m.status === "queued" || m.status === "running");
  const roverKind: Light = rover.estop ? "alert" : rover.status === "online" ? "ok" : rover.status === "offline" ? "alert" : "idle";
  return (
    <>
      <span className="pill" title={`${s.db.kind === "mongomock" ? "In-memory test database: data resets when the API restarts." : "MongoDB"} · ${s.db.zones} beds`}>
        <Dot kind={s.db.kind === "mongomock" ? "warn" : "ok"} />{s.db.kind === "mongomock" ? "Test DB" : "MongoDB"}
      </span>
      <span className="pill" title={s.broker.connected ? "Connected to the farm broker (MQTT)" : `Farm broker unreachable: ${s.broker.error ?? "not connected yet"}`}>
        <Dot kind={s.broker.connected ? "ok" : "alert"} />MQTT
      </span>
      <Link to="/rover" className={`pill pill-link${rover.estop ? " pill-alert" : ""}`}
            title={rover.status === "unknown" ? "The rover has not reported since the server started" : `Rover ${rover.status}`}>
        <Dot kind={going ? "warn" : roverKind} />
        {rover.estop ? "E-stop on" : going ? `Round · ${label ?? ""} ${m?.cellsScanned ?? 0}/${m?.cellsTotal ?? "?"}` : `Rover ${rover.status}`}
      </Link>
    </>
  );
}

function QuickSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const zones = useZones();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results: { label: string; meta: string; to: string }[] = [];
    for (const z of zones.data ?? []) {
      const name = z.label ?? z.zone;
      if (name.toLowerCase().includes(q) || z.zone.toLowerCase().includes(q)) {
        results.push({ label: name, meta: "Block · Rover", to: `/rover?zone=${encodeURIComponent(z.zone)}` });
      }
    }
    for (const [, section] of Object.entries(SECTIONS)) {
      if (section.label.toLowerCase().includes(q)) {
        results.push({ label: section.label, meta: "Section", to: section.to });
      }
      for (const t of section.tabs) {
        if (t.label.toLowerCase().includes(q)) {
          results.push({ label: t.label, meta: section.label, to: t.to });
        }
      }
    }
    return results.slice(0, 7);
  }, [query, zones.data]);

  return (
    <div className="top-search-wrap">
      <div className="top-search">
        <Search size={15} aria-hidden />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
          placeholder="Search blocks, crops, pages…"
          aria-label="Search blocks, crops, pages"
        />
      </div>
      {open && matches.length > 0 && (
        <div className="top-search-menu">
          {matches.map((m) => (
            <button
              key={`${m.to}-${m.label}`}
              type="button"
              className="top-search-item"
              onMouseDown={() => { navigate(m.to); setQuery(""); setOpen(false); }}
            >
              <span>{m.label}</span>
              <small>{m.meta}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TopBar() {
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const fetching = useIsFetching();
  const status = useStatus();
  const key = sectionOf(pathname);
  const section = SECTIONS[key];
  const tab = tabOf(pathname, key);
  return (
    <header className="topbar">
      <div className="topbar-left">
        <QuickSearch />
        <nav className="crumbs" aria-label="You are here">
          <Link to={section.to}>{section.label}</Link>
          {tab && tab.to !== section.to && (<><ChevronRight size={14} aria-hidden /><span>{tab.label}</span></>)}
          {/^\/cycles\/[^/]+/.test(pathname) && (<><ChevronRight size={14} aria-hidden /><span>Crop</span></>)}
        </nav>
      </div>
      <div className="topbar-right">
        <StatusPills />
        {status.data && (
          <span className="topbar-date">
            <CalendarDays size={13} aria-hidden />
            {dayMonthYear(status.data.farmToday)}
          </span>
        )}
        <Link to="/cycles" className="iconbtn" aria-label="Manage crops" title="Manage crops">
          <Plus size={16} aria-hidden />
        </Link>
        <button type="button" className={`iconbtn${fetching ? " spinning" : ""}`} onClick={() => qc.invalidateQueries()}
                aria-label="Refresh all data" title="Refresh all data">
          <RefreshCw size={15} aria-hidden />
        </button>
      </div>
    </header>
  );
}

function Toaster() {
  const toasts = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span>{t.text}</span>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
        </div>
      ))}
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const here = sectionOf(useLocation().pathname);
  const status = useStatus();
  const items = Object.entries(SECTIONS) as [SectionKey, (typeof SECTIONS)[SectionKey]][];
  return (
    <div className="shell">
      <aside className="side">
        <Link to="/" className="brandmark">
          <span className="brand-tile"><Leaf size={20} aria-hidden /></span>
          <span className="brand">{BRAND.name} <b>AI</b><small>Tomato precision farm</small></span>
        </Link>
        <nav className="side-nav" aria-label="Main">
          {items.map(([key, s]) => (
            <Link key={key} to={s.to} className={`side-link${here === key ? " side-on" : ""}`}
                  aria-current={here === key ? "page" : undefined}>
              <s.icon size={18} aria-hidden />{s.label}
            </Link>
          ))}
        </nav>
        <div className="side-card">
          <div className="side-card-head">
            <span className="side-card-ico"><Sparkles size={15} aria-hidden /></span>
            <span>Agronomy Guide</span>
          </div>
          <p>Review Mulder&apos;s chart rules, foliar recipes, and rover vision checks.</p>
          <Link to="/guide" className="side-card-btn">
            <span>Open Care Guide</span>
            <ChevronRight size={14} aria-hidden />
          </Link>
          <div className="side-card-meta">
            <span>{status.data?.farm ?? "farm-01"}</span>
            <span>Single-farm mode</span>
          </div>
        </div>
      </aside>
      <div className="content">
        <TopBar />
        <div className="page-scroll">
          <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
        </div>
      </div>
      <nav className="bottomnav" aria-label="Main">
        {items.map(([key, s]) => (
          <Link key={key} to={s.to} className={`bn${here === key ? " bn-on" : ""}`}
                aria-current={here === key ? "page" : undefined}>
            <s.icon size={22} aria-hidden />{s.label}
          </Link>
        ))}
      </nav>
      <Toaster />
    </div>
  );
}

import { Suspense, useEffect, type ReactNode } from "react";
import { useQueryClient, useIsFetching } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import {
  BookOpen, Bot, Box, CalendarDays, CalendarRange, Calculator, Camera, ChevronRight, ClipboardCheck, ClipboardList, Cpu,
  FlaskConical, GitCompare, History, Images, Info, Leaf, MapPin, Package, Play, ReceiptText, RefreshCw, Scale, Settings,
  SlidersHorizontal, Sprout, Sun, Tractor, TrendingUp, Wallet, Wheat, Wrench, type LucideIcon,
} from "lucide-react";
import { BRAND } from "../lib/brand";
import { dayMonthYear } from "../lib/format";
import { noteRoundState, useStatus, useZones } from "../lib/queries";
import { dismiss, useToasts } from "../lib/toast";
import { PageSkeleton } from "./ui";

type Tab = { to: string; label: string; icon: LucideIcon };

/** The seven places a farmer goes. Everything else is a tab inside one of them. */
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

function tabOf(path: string, key: SectionKey): Tab | undefined {
  const tabs = SECTIONS[key].tabs as readonly Tab[];
  return [...tabs].sort((a, b) => b.to.length - a.to.length).find((t) => path === t.to || path.startsWith(`${t.to}/`));
}

type Light = "ok" | "warn" | "alert" | "idle";
const Dot = ({ kind }: { kind: Light }) => <i className={`dot dot-${kind}`} aria-hidden />;

/** Server, farm broker and rover at a glance, on every page. Also tells every page when a rover round ends. */
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
      <nav className="crumbs" aria-label="You are here">
        <Link to={section.to}>{section.label}</Link>
        {tab && tab.to !== section.to && (<><ChevronRight size={14} aria-hidden /><span>{tab.label}</span></>)}
        {/^\/cycles\/[^/]+/.test(pathname) && (<><ChevronRight size={14} aria-hidden /><span>Crop</span></>)}
      </nav>
      <div className="topbar-right">
        <StatusPills />
        {status.data && <span className="topbar-date">{dayMonthYear(status.data.farmToday)}</span>}
        <button type="button" className={`iconbtn${fetching ? " spinning" : ""}`} onClick={() => qc.invalidateQueries()}
                aria-label="Refresh all data" title="Refresh all data">
          <RefreshCw size={16} aria-hidden />
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
          <span className="brand-tile"><Leaf size={19} aria-hidden /></span>
          <span className="brand">{BRAND.name}<small>Tomato precision farm</small></span>
        </Link>
        <nav className="side-nav" aria-label="Main">
          {items.map(([key, s]) => (
            <Link key={key} to={s.to} className={`side-link${here === key ? " side-on" : ""}`}
                  aria-current={here === key ? "page" : undefined}>
              <s.icon size={18} aria-hidden />{s.label}
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <b>{status.data?.farm ?? "farm"}</b>
          <span>Single-farm mode: anyone on this network can change the data.</span>
        </div>
      </aside>
      <div className="content">
        <TopBar />
        <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
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

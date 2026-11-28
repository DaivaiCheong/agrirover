import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import SampleNotice from "./SampleNotice";
import { PageHead } from "./ui";
import { SECTIONS, type SectionKey } from "./Shell";

const SUBTITLE: Partial<Record<SectionKey, string>> = {
  rover: "The rover's rounds: every plant it checked, its soil and its camera, and what to do next",
  health: "What the rover's camera and the soil say about each plant, the photos you took, and the leaf lab results",
  finance: "Budget from the workbook, costs from the ledger and stock, harvests and sales: one set of numbers",
  farm: "Beds and their soil, inputs in stock, equipment, devices and the farm's settings",
};

/** A section's title and its tabs. */
export default function Section({ id, children }: { id: Exclude<SectionKey, "today" | "plan" | "crops">; children: ReactNode }) {
  const s = SECTIONS[id];
  const loc = useLocation();
  const params = new URLSearchParams(loc.search);
  // a crop's cost report (/cycles/<id>) sits under "By block"; /crop?tab=guide is the guide
  const here = /^\/cycles\/[^/]+/.test(loc.pathname)
    ? "/cop"
    : loc.pathname === "/crop" && params.get("tab") === "guide"
      ? "/guide"
      : loc.pathname;
  return (
    <>
      <PageHead icon={s.icon} title={s.title} sub={SUBTITLE[id]} />
      <nav className="tabs" aria-label={`${s.title} sections`}>
        {s.tabs.map((t) => (
          <Link key={t.to} to={t.to} className={`tab${here === t.to ? " tab-on" : ""}`}
                aria-current={here === t.to ? "page" : undefined}>
            <t.icon size={15} aria-hidden />{t.label}
          </Link>
        ))}
      </nav>
      {id === "finance" && <SampleNotice />}
      {children}
    </>
  );
}

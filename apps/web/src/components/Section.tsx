import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { PageHead } from "./ui";
import { SECTIONS, type SectionKey } from "./Shell";

/** A section's title and its tabs. */
export default function Section({ id, children }: { id: Exclude<SectionKey, "today" | "crops">; children: ReactNode }) {
  const s = SECTIONS[id];
  const path = useLocation().pathname;
  // a crop's cost report (/cycles/<id>) sits under "Cost of production"
  const here = /^\/cycles\/[^/]+/.test(path) ? "/cop" : path;
  return (
    <>
      <PageHead icon={s.icon} title={s.title} />
      <nav className="tabs" aria-label={`${s.title} sections`}>
        {s.tabs.map((t) => (
          <Link key={t.to} to={t.to} className={`tab${here === t.to ? " tab-on" : ""}`}
                aria-current={here === t.to ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </>
  );
}

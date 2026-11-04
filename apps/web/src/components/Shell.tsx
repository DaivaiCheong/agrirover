import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: "OPERATE", items: [["/", "Today"], ["/water", "Water planner"], ["/devices", "Devices"], ["/crop", "Disease check"]] },
  { title: "MANAGE", items: [["/cycles", "Crop cycles"], ["/costs", "Costs"], ["/stock", "Stock"],
                             ["/equipment", "Equipment"], ["/harvest", "Harvest and sales"]] },
  { title: "REPORTS", items: [["/cop", "Cost of production"], ["/compare", "Compare beds"]] },
  { title: "FARM", items: [["/settings", "Settings"]] },
];

export default function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <aside className="side">
        <div className="brandmark side-brand">
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="var(--bp)" strokeWidth="1.4">
            <rect x="2.5" y="2.5" width="15" height="15" /><path d="M10 6v8M6 10h8" />
          </svg>
          <span className="brand">AI AUTO FARM</span>
        </div>
        <nav className="side-nav">
          {GROUPS.map((g) => (
            <div className="side-group" key={g.title}>
              <div className="lbl side-title">{g.title}</div>
              {g.items.map(([to, label]) => (
                <NavLink key={to} to={to} end={to === "/"}
                         className={({ isActive }) => `side-link${isActive ? " side-on" : ""}`}>
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <p className="mono-sm side-foot">One farm. No login yet: anyone with this address can see and change the data.</p>
      </aside>
      <div className="content">{children}</div>
    </div>
  );
}

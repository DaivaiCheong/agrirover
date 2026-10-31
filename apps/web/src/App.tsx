import { NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Irrigation from "./pages/Irrigation";
import Placeholder from "./pages/Placeholder";

const NAV = [
  ["/", "DASHBOARD"],
  ["/irrigation", "IRRIGATION"],
  ["/water", "WATER"],
  ["/crop", "CROP"],
  ["/devices", "DEVICES"],
  ["/reports", "REPORTS"],
] as const;

export default function App() {
  return (
    <>
      <header className="topbar">
        <div className="brandmark">
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none"
               stroke="var(--bp)" strokeWidth="1.4">
            <rect x="2.5" y="2.5" width="15" height="15" /><path d="M10 6v8M6 10h8" />
          </svg>
          <span className="brand">AI AUTO FARM</span>
        </div>
        <nav className="nav">
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"}
                     className={({ isActive }) => `lbl${isActive ? " nav-on" : ""}`}>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/irrigation" element={<Irrigation />} />
        <Route path="/water" element={<Placeholder title="WATER TREATMENT" sprint="Sprint 3" />} />
        <Route path="/crop" element={<Placeholder title="DISEASE DETECTION" sprint="Sprints 6–7" />} />
        <Route path="/devices" element={<Placeholder title="DEVICE REGISTRY" sprint="Sprint 2" />} />
        <Route path="/reports" element={<Placeholder title="REPORTS" sprint="Sprint 5" />} />
      </Routes>
    </>
  );
}

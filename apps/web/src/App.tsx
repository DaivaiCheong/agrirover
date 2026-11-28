import { lazy, useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Section from "./components/Section";
import Shell, { SECTIONS, sectionOf } from "./components/Shell";
import { BRAND } from "./lib/brand";

// Each page loads when it is first opened, so the first screen does not wait for the 3D views and charts.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Plan = lazy(() => import("./pages/Plan"));
const Rover = lazy(() => import("./pages/Rover"));
const RoverHistory = lazy(() => import("./pages/RoverHistory"));
const RoverSoil = lazy(() => import("./pages/RoverSoil"));
const RoverDays = lazy(() => import("./pages/RoverDays"));
const RoverSetup = lazy(() => import("./pages/RoverSetup"));
const RoverAdvice = lazy(() => import("./pages/RoverAdvice"));
const RoverRound = lazy(() => import("./pages/RoverRound"));
const RoverPlants = lazy(() => import("./pages/RoverPlants"));
const RoverAbout = lazy(() => import("./pages/RoverAbout"));
const RoverGrowth = lazy(() => import("./pages/RoverGrowth"));
const RoverSop = lazy(() => import("./pages/RoverSop"));
const RoverTest = lazy(() => import("./pages/RoverTest"));
const Cycles = lazy(() => import("./pages/Cycles"));
const CycleCop = lazy(() => import("./pages/CycleCop"));
const OrchardCycle = lazy(() => import("./pages/OrchardCycle"));
const Finance = lazy(() => import("./pages/Finance"));
const Costs = lazy(() => import("./pages/Costs"));
const CopSummary = lazy(() => import("./pages/CopSummary"));
const Harvest = lazy(() => import("./pages/Harvest"));
const Compare = lazy(() => import("./pages/Compare"));
const Stock = lazy(() => import("./pages/Stock"));
const Equipment = lazy(() => import("./pages/Equipment"));
const Beds = lazy(() => import("./pages/Beds"));
const Settings = lazy(() => import("./pages/Settings"));
const Devices = lazy(() => import("./pages/Devices"));
const Crop = lazy(() => import("./pages/Crop"));
const Photos = lazy(() => import("./pages/Photos"));
const LeafTests = lazy(() => import("./pages/LeafTests"));

const rover = (page: ReactNode) => <Section id="rover">{page}</Section>;
const health = (page: ReactNode) => <Section id="health">{page}</Section>;
const finance = (page: ReactNode) => <Section id="finance">{page}</Section>;
const farm = (page: ReactNode) => <Section id="farm">{page}</Section>;

/** The browser tab says where you are: "Cost ledger · Finance · AgriRover". */
function useTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    const key = sectionOf(pathname);
    const tab = (SECTIONS[key].tabs as readonly { to: string; label: string }[]).find((t) => t.to === pathname);
    const parts = [tab && tab.label !== SECTIONS[key].label ? tab.label : null, SECTIONS[key].label, BRAND.name].filter(Boolean);
    document.title = parts.join(" · ");
  }, [pathname]);
}

export default function App() {
  useTitle();
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/rover" element={rover(<Rover />)} />
        <Route path="/rover/soil" element={rover(<RoverSoil />)} />
        <Route path="/rover/history" element={rover(<RoverHistory />)} />
        <Route path="/rover/days" element={rover(<RoverDays />)} />
        <Route path="/rover/setup" element={rover(<RoverSetup />)} />
        <Route path="/rover/advice" element={rover(<RoverAdvice />)} />
        <Route path="/rover/round" element={rover(<RoverRound />)} />
        <Route path="/rover/plants" element={rover(<RoverPlants />)} />
        <Route path="/rover/about" element={rover(<RoverAbout />)} />
        <Route path="/rover/growth" element={rover(<RoverGrowth />)} />
        <Route path="/rover/sop" element={rover(<RoverSop />)} />
        <Route path="/rover/test" element={rover(<RoverTest />)} />
        <Route path="/rover/*" element={<Navigate to="/rover" replace />} />
        <Route path="/cycles" element={<Cycles />} />
        <Route path="/cycles/:id" element={<CycleCop />} />
        <Route path="/cycles/:id/orchard" element={<OrchardCycle />} />
        <Route path="/cycles/:id/tomato" element={<OrchardCycle />} />
        <Route path="/finance" element={finance(<Finance />)} />
        <Route path="/costs" element={finance(<Costs />)} />
        <Route path="/harvest" element={finance(<Harvest />)} />
        <Route path="/cop" element={finance(<CopSummary />)} />
        <Route path="/compare" element={finance(<Compare />)} />
        <Route path="/stock" element={farm(<Stock />)} />
        <Route path="/equipment" element={farm(<Equipment />)} />
        <Route path="/beds" element={farm(<Beds />)} />
        <Route path="/settings" element={farm(<Settings />)} />
        <Route path="/devices" element={farm(<Devices />)} />
        <Route path="/crop" element={health(<Crop initialTab="gallery" />)} />
        <Route path="/guide" element={health(<Crop initialTab="guide" />)} />
        <Route path="/photos" element={health(<Photos />)} />
        <Route path="/leaf-tests" element={health(<LeafTests />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

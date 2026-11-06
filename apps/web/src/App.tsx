import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Section from "./components/Section";
import Shell from "./components/Shell";
import { BRAND } from "./lib/brand";
import Compare from "./pages/Compare";
import CopSummary from "./pages/CopSummary";
import Costs from "./pages/Costs";
import Crop from "./pages/Crop";
import CycleCop from "./pages/CycleCop";
import Cycles from "./pages/Cycles";
import Dashboard from "./pages/Dashboard";
import Devices from "./pages/Devices";
import Equipment from "./pages/Equipment";
import Finance from "./pages/Finance";
import Guide from "./pages/Guide";
import Harvest from "./pages/Harvest";
import OrchardCycle from "./pages/OrchardCycle";
import Photos from "./pages/Photos";
import Plan from "./pages/Plan";
import Rover from "./pages/Rover";
import RoverAbout from "./pages/RoverAbout";
import RoverGrowth from "./pages/RoverGrowth";
import RoverHistory from "./pages/RoverHistory";
import RoverSop from "./pages/RoverSop";
import Settings from "./pages/Settings";
import Stock from "./pages/Stock";
import Beds from "./pages/Beds";

const rover = (page: ReactNode) => <Section id="rover">{page}</Section>;
const health = (page: ReactNode) => <Section id="health">{page}</Section>;
const finance = (page: ReactNode) => <Section id="finance">{page}</Section>;
const farm = (page: ReactNode) => <Section id="farm">{page}</Section>;

export default function App() {
  useEffect(() => { document.title = BRAND.name; }, []);
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/rover" element={rover(<Rover />)} />
        <Route path="/rover/about" element={rover(<RoverAbout />)} />
        <Route path="/rover/growth" element={rover(<RoverGrowth />)} />
        <Route path="/rover/sop" element={rover(<RoverSop />)} />
        <Route path="/rover/history" element={rover(<RoverHistory />)} />
        <Route path="/cycles" element={<Cycles />} />
        <Route path="/cycles/:id" element={<CycleCop />} />
        <Route path="/cycles/:id/orchard" element={<OrchardCycle />} />
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
        <Route path="/crop" element={health(<Crop />)} />
        <Route path="/photos" element={health(<Photos />)} />
        <Route path="/guide" element={health(<Guide />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

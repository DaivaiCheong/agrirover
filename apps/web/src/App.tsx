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
import Harvest from "./pages/Harvest";
import OrchardCycle from "./pages/OrchardCycle";
import Photos from "./pages/Photos";
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
const money = (page: ReactNode) => <Section id="money">{page}</Section>;
const results = (page: ReactNode) => <Section id="results">{page}</Section>;
const farm = (page: ReactNode) => <Section id="farm">{page}</Section>;

export default function App() {
  useEffect(() => { document.title = BRAND.name; }, []);
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/rover" element={rover(<Rover />)} />
        <Route path="/rover/about" element={rover(<RoverAbout />)} />
        <Route path="/rover/growth" element={rover(<RoverGrowth />)} />
        <Route path="/rover/sop" element={rover(<RoverSop />)} />
        <Route path="/rover/history" element={rover(<RoverHistory />)} />
        <Route path="/cycles" element={<Cycles />} />
        <Route path="/cycles/:id" element={<CycleCop />} />
        <Route path="/cycles/:id/orchard" element={<OrchardCycle />} />
        <Route path="/costs" element={money(<Costs />)} />
        <Route path="/stock" element={money(<Stock />)} />
        <Route path="/equipment" element={money(<Equipment />)} />
        <Route path="/cop" element={results(<CopSummary />)} />
        <Route path="/harvest" element={results(<Harvest />)} />
        <Route path="/compare" element={results(<Compare />)} />
        <Route path="/beds" element={farm(<Beds />)} />
        <Route path="/settings" element={farm(<Settings />)} />
        <Route path="/devices" element={farm(<Devices />)} />
        <Route path="/crop" element={health(<Crop />)} />
        <Route path="/photos" element={health(<Photos />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

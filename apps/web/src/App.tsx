import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Section from "./components/Section";
import Shell from "./components/Shell";
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
import Plan from "./pages/Plan";
import Settings from "./pages/Settings";
import Stock from "./pages/Stock";

const money = (page: ReactNode) => <Section id="money">{page}</Section>;
const results = (page: ReactNode) => <Section id="results">{page}</Section>;
const farm = (page: ReactNode) => <Section id="farm">{page}</Section>;

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/cycles" element={<Cycles />} />
        <Route path="/cycles/:id" element={<CycleCop />} />
        <Route path="/costs" element={money(<Costs />)} />
        <Route path="/stock" element={money(<Stock />)} />
        <Route path="/equipment" element={money(<Equipment />)} />
        <Route path="/cop" element={results(<CopSummary />)} />
        <Route path="/harvest" element={results(<Harvest />)} />
        <Route path="/compare" element={results(<Compare />)} />
        <Route path="/settings" element={farm(<Settings />)} />
        <Route path="/devices" element={farm(<Devices />)} />
        <Route path="/crop" element={farm(<Crop />)} />
        <Route path="/water" element={<Navigate to="/plan" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

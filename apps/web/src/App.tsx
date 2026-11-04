import { Route, Routes } from "react-router-dom";
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
import Settings from "./pages/Settings";
import Stock from "./pages/Stock";
import WaterPlanner from "./pages/WaterPlanner";

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/water" element={<WaterPlanner />} />
        <Route path="/devices" element={<Devices />} />
        <Route path="/crop" element={<Crop />} />
        <Route path="/cycles" element={<Cycles />} />
        <Route path="/cycles/:id" element={<CycleCop />} />
        <Route path="/costs" element={<Costs />} />
        <Route path="/stock" element={<Stock />} />
        <Route path="/equipment" element={<Equipment />} />
        <Route path="/harvest" element={<Harvest />} />
        <Route path="/cop" element={<CopSummary />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Shell>
  );
}

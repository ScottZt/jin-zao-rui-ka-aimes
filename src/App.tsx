import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import WorkOrders from "./pages/WorkOrders";
import Dispatch from "./pages/Dispatch";
import Inventory from "./pages/Inventory";
import SkillCenter from "./pages/SkillCenter";
import Billing from "./pages/Billing";
import Settings from "./pages/Settings";
import WorkReports from "./pages/WorkReports";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="work-orders" element={<WorkOrders />} />
          <Route path="dispatch" element={<Dispatch />} />
          <Route path="work-reports" element={<WorkReports />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="skill-center" element={<SkillCenter />} />
          <Route path="billing" element={<Billing />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </Router>
  );
}

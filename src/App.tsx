import { HashRouter, Route, Routes } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import { AppShell } from "./components/layout/AppShell";
import { Today } from "./pages/Today";
import { BrainDump } from "./pages/BrainDump";
import { SortThoughts } from "./pages/SortThoughts";
import { Tasks } from "./pages/Tasks";
import { CalendarPage } from "./pages/CalendarPage";
import { ArchivePage } from "./pages/ArchivePage";

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Today />} />
            <Route path="/brain-dump" element={<BrainDump />} />
            <Route path="/sort" element={<SortThoughts />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/archive" element={<ArchivePage />} />
          </Route>
        </Routes>
      </HashRouter>
    </AppProvider>
  );
}

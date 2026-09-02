import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { useTheme } from "../../hooks/useTheme";

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { theme, toggle } = useTheme();

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-paper dark:bg-transparent">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-full focus:bg-eggplant focus:px-4 focus:py-2 focus:text-cream"
      >
        Skip to content
      </a>

      <aside className="hidden lg:block w-72 shrink-0 h-full">
        <Sidebar />
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-eggplant/50 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative h-full w-72 animate-fade-in">
            <Sidebar onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col h-full">
        <TopBar onMenuClick={() => setMobileNavOpen(true)} theme={theme} onToggleTheme={toggle} />
        <main
          id="main-content"
          className="flex-1 overflow-y-auto scrollbar-thin px-5 py-6 sm:px-8 sm:py-8"
        >
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

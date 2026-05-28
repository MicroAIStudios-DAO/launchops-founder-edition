import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import ControlTowerLayout from "./components/ControlTowerLayout";
import AtlasAssistant from "./components/AtlasAssistant";
import Overview from "./pages/Overview";
import Logs from "./pages/Logs";
import Stats from "./pages/Stats";
import Controls from "./pages/Controls";
import Exports from "./pages/Exports";
import AuditLog from "./pages/AuditLog";
import Agents from "./pages/Agents";
import Onboarding from "./pages/Onboarding";
import NotFound from "./pages/NotFound";

function Router() {
  return (
    <ControlTowerLayout>
      <Switch>
        <Route path="/" component={Overview} />
        <Route path="/onboarding" component={Onboarding} />
        <Route path="/logs" component={Logs} />
        <Route path="/stats" component={Stats} />
        <Route path="/controls" component={Controls} />
        <Route path="/exports" component={Exports} />
        <Route path="/audit" component={AuditLog} />
        <Route path="/agents" component={Agents} />
        <Route component={NotFound} />
      </Switch>
    </ControlTowerLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
          {/* Atlas AI assistant — globally available on all pages */}
          <AtlasAssistant />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

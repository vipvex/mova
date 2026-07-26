import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Play from "@/pages/Play";
import GameMap from "@/pages/GameMap";
import ReviewPortal from "@/pages/ReviewPortal";
import AdminGames from "@/pages/AdminGames";
import Admin from "@/pages/Admin";
import Login from "@/pages/Login";
import Stories from "@/pages/Stories";
import Curriculum from "@/pages/Curriculum";
import { UserProvider, useUser } from "@/contexts/UserContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import BackgroundMusic from "@/components/BackgroundMusic";

function AuthenticatedRoutes() {
  const { currentUser, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-sky-100 to-sky-200 dark:from-sky-900 dark:to-sky-950">
        <div className="text-2xl font-bold text-sky-700 dark:text-sky-300">Loading...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login />;
  }

  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/admin/:tab" component={Admin} />
      <Route path="/admin" component={Admin} />
      <Route path="/stories" component={Stories} />
      <Route path="/curriculum" component={Curriculum} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <UserProvider>
          <SettingsProvider>
            <Toaster />
            <Switch>
              {/* Public, login-free game surface (the kid never logs in) */}
              <Route path="/map" component={GameMap} />
              <Route path="/review" component={ReviewPortal} />
              <Route path="/studio/:tab" component={AdminGames} />
              <Route path="/studio" component={AdminGames} />
              <Route path="/play/:id" component={Play} />
              <Route path="/play" component={Play} />
              <Route><AuthenticatedRoutes /></Route>
            </Switch>
            {/* <BackgroundMusic /> disabled */}
          </SettingsProvider>
        </UserProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

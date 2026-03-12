import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClientShell } from "@/components/client-shell";
import NotFound from "@/pages/not-found";

import Home from "@/pages/home";
import Clubs from "@/pages/clubs";
import Schools from "@/pages/schools";
import Quote from "@/pages/quote";
import Contact from "@/pages/contact";
import Sports from "@/pages/sports";
import OurWorkPage from "@/pages/our-work";
import CaseStudyDetailPage from "@/pages/case-study-detail";
import TeamStoresPage from "@/pages/team-stores";
import TeamStoreDetailPage from "@/pages/team-store-detail";

function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  return null;
}

function Router() {
  return (
    <>
      <ScrollToTop />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/clubs" component={Clubs} />
        <Route path="/schools" component={Schools} />
        <Route path="/sports" component={Sports} />
        <Route path="/team-stores" component={TeamStoresPage} />
        <Route path="/team-stores/:slug" component={TeamStoreDetailPage} />
        <Route path="/our-work" component={OurWorkPage} />
        <Route path="/our-work/:slug" component={CaseStudyDetailPage} />
        <Route path="/quote" component={Quote} />
        <Route path="/contact" component={Contact} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <ClientShell>
            <Router />
        </ClientShell>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

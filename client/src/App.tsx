import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClientShell } from "@/components/client-shell";
import { AuthProvider } from "@/lib/auth-context";
import { ProtectedRoute, AdminRoute } from "@/components/protected-route";
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
import SponsorPlacement from "@/pages/sponsor-placement";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import AcceptInvitePage from "@/pages/accept-invite";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminOrders from "@/pages/admin/orders";
import AdminOrderDetail from "@/pages/admin/order-detail";
import AdminCustomers from "@/pages/admin/customers";
import AdminCustomerDetail from "@/pages/admin/customer-detail";
import AdminDesignReview from "@/pages/admin/design-review";
import AdminPurchaseOrder from "@/pages/admin/purchase-order";
import AdminCreatePO from "@/pages/admin/create-po";
import AdminMockups from "@/pages/admin/mockups";
import AdminMockupDetail from "@/pages/admin/mockup-detail";
import GetMockupPage from "@/pages/get-mockup";
import PortalDashboard from "@/pages/portal/dashboard";
import PortalOrders from "@/pages/portal/orders";
import PortalOrderDetail from "@/pages/portal/order-detail";
import PortalProfile from "@/pages/portal/profile";
import PortalNotifications from "@/pages/portal/notifications";
import PortalInvoice from "@/pages/portal/invoice";

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
        {/* Public pages */}
        <Route path="/" component={Home} />
        <Route path="/clubs" component={Clubs} />
        <Route path="/schools" component={Schools} />
        <Route path="/sports" component={Sports} />
        <Route path="/team-stores" component={TeamStoresPage} />
        <Route path="/team-stores/:slug" component={TeamStoreDetailPage} />
        <Route path="/our-work" component={OurWorkPage} />
        <Route path="/our-work/:slug" component={CaseStudyDetailPage} />
        <Route path="/sponsor-placement" component={SponsorPlacement} />
        <Route path="/quote" component={Quote} />
        <Route path="/contact" component={Contact} />
        <Route path="/get-mockup" component={GetMockupPage} />

        {/* Auth pages */}
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/accept-invite" component={AcceptInvitePage} />

        {/* Admin portal */}
        <Route path="/admin/orders/create-po">
          {() => <AdminRoute><AdminCreatePO /></AdminRoute>}
        </Route>
        <Route path="/admin/orders/:id/po">
          {() => <AdminRoute><AdminPurchaseOrder /></AdminRoute>}
        </Route>
        <Route path="/admin/orders/:id">
          {() => <AdminRoute><AdminOrderDetail /></AdminRoute>}
        </Route>
        <Route path="/admin/orders">
          {() => <AdminRoute><AdminOrders /></AdminRoute>}
        </Route>
        <Route path="/admin/customers/:id">
          {() => <AdminRoute><AdminCustomerDetail /></AdminRoute>}
        </Route>
        <Route path="/admin/customers">
          {() => <AdminRoute><AdminCustomers /></AdminRoute>}
        </Route>
        <Route path="/admin/designs">
          {() => <AdminRoute><AdminDesignReview /></AdminRoute>}
        </Route>
        <Route path="/admin/mockups/:id">
          {() => <AdminRoute><AdminMockupDetail /></AdminRoute>}
        </Route>
        <Route path="/admin/mockups">
          {() => <AdminRoute><AdminMockups /></AdminRoute>}
        </Route>
        <Route path="/admin">
          {() => <AdminRoute><AdminDashboard /></AdminRoute>}
        </Route>

        {/* Customer portal */}
        <Route path="/portal/orders/:id/invoice">
          {() => <ProtectedRoute><PortalInvoice /></ProtectedRoute>}
        </Route>
        <Route path="/portal/orders/:id">
          {() => <ProtectedRoute><PortalOrderDetail /></ProtectedRoute>}
        </Route>
        <Route path="/portal/orders">
          {() => <ProtectedRoute><PortalOrders /></ProtectedRoute>}
        </Route>
        <Route path="/portal/profile">
          {() => <ProtectedRoute><PortalProfile /></ProtectedRoute>}
        </Route>
        <Route path="/portal/notifications">
          {() => <ProtectedRoute><PortalNotifications /></ProtectedRoute>}
        </Route>
        <Route path="/portal">
          {() => <ProtectedRoute><PortalDashboard /></ProtectedRoute>}
        </Route>

        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <ClientShell>
              <Router />
          </ClientShell>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

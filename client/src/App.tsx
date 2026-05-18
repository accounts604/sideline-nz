import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClientShell } from "@/components/client-shell";
import { AuthProvider } from "@/lib/auth-context";
import { ProtectedRoute, AdminRoute, ClubPortalRoute, SupplierRoute } from "@/components/protected-route";
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
import SizeChartPage from "@/pages/size-chart";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import AcceptInvitePage from "@/pages/accept-invite";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminOrders from "@/pages/admin/orders";
import AdminOrderDetail from "@/pages/admin/order-detail";
import AdminCustomers from "@/pages/admin/customers";
import AdminCustomerDetail from "@/pages/admin/customer-detail";
import AdminSuppliers from "@/pages/admin/suppliers";
import AdminSupplierDetail from "@/pages/admin/supplier-detail";
import AdminVault from "@/pages/admin/vault";
import AdminDesignReview from "@/pages/admin/design-review";
import AdminPurchaseOrder from "@/pages/admin/purchase-order";
import AdminCreatePO from "@/pages/admin/create-po";
import AdminMockups from "@/pages/admin/mockups";
import AdminIntegrations from "@/pages/admin/integrations";
import AdminAi from "@/pages/admin/ai";
import AdminEzra from "@/pages/admin/ezra";
import AdminMockupDetail from "@/pages/admin/mockup-detail";
import AdminQuotes from "@/pages/admin/quotes";
import AdminQuoteDetail from "@/pages/admin/quote-detail";
import AdminCreateQuote from "@/pages/admin/create-quote";
import AdminQuoteTemplates from "@/pages/admin/quote-templates";
import AdminTriage from "@/pages/admin/triage";
import QuoteViewPage from "@/pages/quote-view";
import GetMockupPage from "@/pages/get-mockup";
import FreeMockup from "@/pages/free-mockup";
import PortalDashboard from "@/pages/portal/dashboard";
import PortalOrders from "@/pages/portal/orders";
import PortalOrderDetail from "@/pages/portal/order-detail";
import PortalProfile from "@/pages/portal/profile";
import PortalNotifications from "@/pages/portal/notifications";
import PortalInvoice from "@/pages/portal/invoice";
import ClubPortalIndex from "@/pages/club-portal/index";
import ClubPortalLogin from "@/pages/club-portal/login";
import ClubPortalDashboard from "@/pages/club-portal/dashboard";
import MockupReviewPage from "@/pages/club-portal/mockup-review";
import OrderTrackingPage from "@/pages/club-portal/order-tracking";
import ClubSupporterDashboard from "@/pages/club-portal/supporter-dashboard";
import SupplierLoginPage from "@/pages/supplier/login";
import SupplierDashboard from "@/pages/supplier/dashboard";
import SupplierOrderDetail from "@/pages/supplier/order-detail";
import ApprovePage from "@/pages/approve";
import ClientPo from "@/pages/client-po";

function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  return null;
}

/** Hide GHL chat widget on internal portal / admin routes,
 *  and suppress it when the page was loaded by a known scraper
 *  (e.g. Shopify admin link previewer) — those page loads
 *  otherwise create "guest visitor" contacts in GHL with no
 *  identifying info. */
function GhlChatVisibility() {
  const [location] = useLocation();

  useEffect(() => {
    const widget = document.querySelector("chat-widget") as HTMLElement | null;
    if (!widget) return;
    const internal = /^\/(admin|portal|club-portal|supplier)/.test(location);
    const scraperReferrer = /admin\.shopify\.com|googleusercontent\.com|linkedin\.com\/preview/i.test(
      document.referrer || "",
    );
    widget.style.display = internal || scraperReferrer ? "none" : "";
  }, [location]);

  return null;
}

function Router() {
  return (
    <>
      <ScrollToTop />
      <GhlChatVisibility />
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
        <Route path="/size-chart" component={SizeChartPage} />
        <Route path="/quote" component={Quote} />
        <Route path="/contact" component={Contact} />
        <Route path="/free-mockup" component={FreeMockup} />
        <Route path="/get-mockup" component={GetMockupPage} />
        <Route path="/quote-view/:token" component={QuoteViewPage} />

        {/* Auth pages */}
        <Route path="/login" component={LoginPage} />
        <Route path="/register" component={RegisterPage} />
        <Route path="/accept-invite" component={AcceptInvitePage} />

        {/* Admin portal */}
        <Route path="/admin/triage">
          {() => <AdminRoute><AdminTriage /></AdminRoute>}
        </Route>
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
        <Route path="/admin/suppliers/:id">
          {() => <AdminRoute><AdminSupplierDetail /></AdminRoute>}
        </Route>
        <Route path="/admin/suppliers">
          {() => <AdminRoute><AdminSuppliers /></AdminRoute>}
        </Route>
        <Route path="/admin/vault">
          {() => <AdminRoute><AdminVault /></AdminRoute>}
        </Route>
        <Route path="/admin/designs">
          {() => <AdminRoute><AdminDesignReview /></AdminRoute>}
        </Route>
        <Route path="/admin/quotes/create">
          {() => <AdminRoute><AdminCreateQuote /></AdminRoute>}
        </Route>
        <Route path="/admin/quotes/templates">
          {() => <AdminRoute><AdminQuoteTemplates /></AdminRoute>}
        </Route>
        <Route path="/admin/quotes/:id">
          {() => <AdminRoute><AdminQuoteDetail /></AdminRoute>}
        </Route>
        <Route path="/admin/quotes">
          {() => <AdminRoute><AdminQuotes /></AdminRoute>}
        </Route>
        <Route path="/admin/mockups/:id">
          {() => <AdminRoute><AdminMockupDetail /></AdminRoute>}
        </Route>
        <Route path="/admin/mockups">
          {() => <AdminRoute><AdminMockups /></AdminRoute>}
        </Route>
        <Route path="/admin/integrations">
          {() => <AdminRoute><AdminIntegrations /></AdminRoute>}
        </Route>
        <Route path="/admin/ezra">
          {() => <AdminRoute><AdminEzra /></AdminRoute>}
        </Route>
        <Route path="/admin/ai">
          {() => <AdminRoute><AdminAi /></AdminRoute>}
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

        {/* Public client approval (no auth — token in URL) */}
        <Route path="/approve/:token" component={ApprovePage} />
        <Route path="/client-po/:token" component={ClientPo} />

        {/* Supplier Portal */}
        <Route path="/supplier/login" component={SupplierLoginPage} />
        <Route path="/supplier/orders/:id">
          {() => <SupplierRoute><SupplierOrderDetail /></SupplierRoute>}
        </Route>
        <Route path="/supplier">
          {() => <SupplierRoute><SupplierDashboard /></SupplierRoute>}
        </Route>

        {/* Club Portal */}
        <Route path="/club-portal/login" component={ClubPortalLogin} />
        <Route path="/club-portal/mockup-review">
          {() => <ClubPortalRoute><MockupReviewPage /></ClubPortalRoute>}
        </Route>
        <Route path="/club-portal/order-tracking">
          {() => <ClubPortalRoute><OrderTrackingPage /></ClubPortalRoute>}
        </Route>
        <Route path="/club-portal/dashboard">
          {() => <ClubPortalRoute><ClubPortalDashboard /></ClubPortalRoute>}
        </Route>
        <Route path="/club-portal/supporter-dashboard">
          {() => <ClubPortalRoute><ClubSupporterDashboard /></ClubPortalRoute>}
        </Route>
        <Route path="/club-portal">
          {() => <ClubPortalRoute><ClubPortalIndex /></ClubPortalRoute>}
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

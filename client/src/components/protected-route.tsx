import { Redirect } from "wouter";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (user.role !== "admin") {
    return <Redirect to="/portal" />;
  }

  return <>{children}</>;
}

export function SupplierRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A1628" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#C9A84C" }} />
      </div>
    );
  }

  // Suppliers always land on /supplier/login, not the marketing /login
  if (!user) {
    return <Redirect to="/supplier/login" />;
  }

  // Anyone logged in who isn't a supplier gets bounced — admins to /admin, customers to /portal
  if (user.role !== "supplier") {
    return <Redirect to={user.role === "admin" ? "/admin" : "/portal"} />;
  }

  return <>{children}</>;
}

export function ClubPortalRoute({ children }: { children: React.ReactNode }) {
  const { data: me, isLoading } = useQuery({
    queryKey: ["/api/club-portal/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!me) {
    return <Redirect to="/club-portal/login" />;
  }

  return <>{children}</>;
}

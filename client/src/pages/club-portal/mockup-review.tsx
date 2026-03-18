import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ClubPortalLayout } from "@/components/club-portal-layout";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Loader2, Check } from "lucide-react";

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  mockupUrl: string | null;
}

interface ClubMe {
  clubName: string;
  email: string;
}

export default function MockupReviewPage() {
  const [, navigate] = useLocation();
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const { data: me } = useQuery<ClubMe>({
    queryKey: ["/api/club-portal/me"],
    queryFn: getQueryFn(),
  });

  const { data: order, isLoading: orderLoading } = useQuery<Order>({
    queryKey: ["/api/club-portal/order"],
    queryFn: getQueryFn(),
  });

  const handleLogout = async () => {
    await apiRequest("POST", "/api/club-portal/logout");
    navigate("/club-portal/login");
  };

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/club-portal/approve-mockup");
      return res.json();
    },
    onSuccess: () => {
      setShowApprovalModal(false);
      setSuccessMessage("Mockup approved! Your order is now in production.");
      setTimeout(() => {
        navigate("/club-portal/dashboard");
      }, 2000);
    },
  });

  const revisionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/club-portal/request-revision", {
        notes: revisionNotes,
      });
      return res.json();
    },
    onSuccess: () => {
      setShowRevisionForm(false);
      setRevisionNotes("");
      setSuccessMessage("Revision request sent! We'll get back to you shortly.");
      setTimeout(() => {
        navigate("/club-portal/dashboard");
      }, 2000);
    },
  });

  if (orderLoading) {
    return (
      <ClubPortalLayout
        clubName={me?.clubName || "Club"}
        clubEmail={me?.email}
        onLogout={handleLogout}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "400px" }}>
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#fff" }} />
        </div>
      </ClubPortalLayout>
    );
  }

  const mockupReady = order?.status === "mockup_ready";
  const mockupUrl = order?.mockupUrl;

  return (
    <ClubPortalLayout
      clubName={me?.clubName || "Club"}
      clubEmail={me?.email}
      onLogout={handleLogout}
    >
      <h1
        style={{
          fontSize: "28px",
          fontWeight: 700,
          color: "#fff",
          marginBottom: "32px",
          fontFamily: "var(--font-heading, monospace)",
          letterSpacing: "1px",
          textTransform: "uppercase",
        }}
      >
        Mockup Review
      </h1>

      {successMessage && (
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(34,197,94,0.1)",
            border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: "6px",
            marginBottom: "24px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            color: "#22c55e",
            fontSize: "13px",
          }}
        >
          <Check size={16} />
          {successMessage}
        </div>
      )}

      {!mockupReady || !mockupUrl ? (
        <div
          style={{
            padding: "32px",
            background: "#111",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "6px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.6)" }}>
            Your mockup is being prepared. We'll notify you by email when it's ready to review.
          </p>
        </div>
      ) : (
        <>
          {/* Mockup Image */}
          <div style={{ marginBottom: "32px" }}>
            <div
              style={{
                background: "#111",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "6px",
                overflow: "hidden",
                maxWidth: "100%",
              }}
            >
              <img
                src={mockupUrl}
                alt="Your mockup"
                style={{
                  width: "100%",
                  height: "auto",
                  display: "block",
                }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "32px", flexWrap: "wrap" }}>
            <button
              onClick={() => setShowApprovalModal(true)}
              disabled={approveMutation.isPending}
              style={{
                flex: "1",
                minWidth: "200px",
                padding: "12px 16px",
                background: approveMutation.isPending ? "rgba(255,255,255,0.1)" : "#fff",
                color: approveMutation.isPending ? "rgba(255,255,255,0.3)" : "#000",
                border: "none",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                cursor: approveMutation.isPending ? "not-allowed" : "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!approveMutation.isPending) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.9)";
                }
              }}
              onMouseLeave={(e) => {
                if (!approveMutation.isPending) {
                  e.currentTarget.style.background = "#fff";
                }
              }}
            >
              {approveMutation.isPending ? "Approving..." : "Approve this design"}
            </button>

            <button
              onClick={() => setShowRevisionForm(!showRevisionForm)}
              style={{
                flex: "1",
                minWidth: "200px",
                padding: "12px 16px",
                background: "transparent",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              Request a revision
            </button>
          </div>

          {/* Revision Form */}
          {showRevisionForm && (
            <div
              style={{
                padding: "24px",
                background: "#111",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "6px",
                marginBottom: "32px",
              }}
            >
              <h3
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#fff",
                  marginBottom: "12px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                What would you like changed?
              </h3>

              <textarea
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value.slice(0, 500))}
                placeholder="Describe the changes you'd like to see..."
                style={{
                  width: "100%",
                  minHeight: "120px",
                  padding: "12px",
                  background: "#000",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "6px",
                  color: "#fff",
                  fontSize: "13px",
                  fontFamily: "monospace",
                  resize: "none",
                  marginBottom: "12px",
                }}
                onFocus={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.3)")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.12)")}
              />

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "16px",
                }}
              >
                <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
                  {revisionNotes.length}/500 characters
                </p>
                <p
                  style={{
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.4)",
                    fontStyle: "italic",
                  }}
                >
                  1 free revision included. Additional revisions may incur a charge.
                </p>
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={() => {
                    revisionMutation.mutate();
                  }}
                  disabled={!revisionNotes || revisionMutation.isPending}
                  style={{
                    flex: 1,
                    padding: "10px 16px",
                    background: !revisionNotes || revisionMutation.isPending ? "rgba(255,255,255,0.1)" : "#fff",
                    color: !revisionNotes || revisionMutation.isPending ? "rgba(255,255,255,0.3)" : "#000",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "12px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    cursor: !revisionNotes || revisionMutation.isPending ? "not-allowed" : "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (revisionNotes && !revisionMutation.isPending) {
                      e.currentTarget.style.background = "rgba(255,255,255,0.9)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (revisionNotes && !revisionMutation.isPending) {
                      e.currentTarget.style.background = "#fff";
                    }
                  }}
                >
                  {revisionMutation.isPending ? "Submitting..." : "Submit revision request"}
                </button>

                <button
                  onClick={() => {
                    setShowRevisionForm(false);
                    setRevisionNotes("");
                  }}
                  style={{
                    padding: "10px 16px",
                    background: "transparent",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.3)",
                    borderRadius: "4px",
                    fontSize: "12px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div
            style={{
              padding: "12px 16px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "6px",
              fontSize: "12px",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            1 free revision is included. Additional revisions may incur a charge.
          </div>
        </>
      )}

      {/* Approval Modal */}
      {showApprovalModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "16px",
          }}
          onClick={() => setShowApprovalModal(false)}
        >
          <div
            style={{
              background: "#111",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "6px",
              padding: "24px",
              maxWidth: "400px",
              width: "100%",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#fff",
                marginBottom: "12px",
              }}
            >
              Confirm Approval
            </h2>

            <p
              style={{
                fontSize: "13px",
                color: "rgba(255,255,255,0.6)",
                marginBottom: "24px",
              }}
            >
              Once approved, your design is locked and moves to production. Are you sure?
            </p>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  background: approveMutation.isPending ? "rgba(255,255,255,0.1)" : "#fff",
                  color: approveMutation.isPending ? "rgba(255,255,255,0.3)" : "#000",
                  border: "none",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  cursor: approveMutation.isPending ? "not-allowed" : "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!approveMutation.isPending) {
                    e.currentTarget.style.background = "rgba(255,255,255,0.9)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!approveMutation.isPending) {
                    e.currentTarget.style.background = "#fff";
                  }
                }}
              >
                {approveMutation.isPending ? "Approving..." : "Yes, approve"}
              </button>

              <button
                onClick={() => setShowApprovalModal(false)}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  background: "transparent",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.3)",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </ClubPortalLayout>
  );
}

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin-layout";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { FolderOpen, ExternalLink, FileText, RefreshCw, AlertTriangle, Folder, Search, ChevronRight, Home } from "lucide-react";

const FOLDER_MIME = "application/vnd.google-apps.folder";

interface BreadcrumbEntry {
  id: string;
  name: string;
}

interface VaultOrder {
  id: string;
  orderNumber: string;
  poReference: string | null;
  accountName: string | null;
  customerEmail: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  driveFolderId: string | null;
  driveFolderUrl: string | null;
  driveFolderName: string | null;
  pipelineStage: string | null;
  createdAt: string;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  iconLink?: string;
  modifiedTime?: string;
  size?: string;
}

export default function AdminVault() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<VaultOrder | null>(null);
  const [search, setSearch] = useState("");
  // Breadcrumb for sub-folder drill-in. First entry = root (PO folder).
  const [crumbs, setCrumbs] = useState<BreadcrumbEntry[]>([]);
  const currentFolderId = crumbs.length ? crumbs[crumbs.length - 1].id : null;

  // Reset breadcrumbs when the selected PO changes
  useEffect(() => {
    if (selected) {
      setCrumbs(
        selected.driveFolderId
          ? [{ id: selected.driveFolderId, name: selected.driveFolderName || "Root" }]
          : [],
      );
    } else {
      setCrumbs([]);
    }
  }, [selected?.id]);

  const { data, isLoading } = useQuery<{ configured: boolean; orders: VaultOrder[] }>({
    queryKey: ["/api/admin/vault"],
  });

  const filesKey = selected && currentFolderId
    ? `/api/admin/vault/${selected.id}/files?folderId=${currentFolderId}`
    : selected
      ? `/api/admin/vault/${selected.id}/files`
      : "";

  const { data: filesData, isLoading: filesLoading } = useQuery<{ order: VaultOrder; files: DriveFile[]; missing?: boolean; folderId?: string; rootFolderId?: string }>({
    queryKey: [filesKey],
    enabled: !!selected?.id,
  });

  const folders = (filesData?.files || []).filter((f) => f.mimeType === FOLDER_MIME);
  const files = (filesData?.files || []).filter((f) => f.mimeType !== FOLDER_MIME);

  const createFolderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest("POST", `/api/admin/vault/${orderId}/create-folder`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vault"] });
      if (selected) queryClient.invalidateQueries({ queryKey: [`/api/admin/vault/${selected.id}/files`] });
    },
  });

  const filtered = (data?.orders || []).filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (o.poReference || "").toLowerCase().includes(q) ||
      (o.orderNumber || "").toLowerCase().includes(q) ||
      (o.accountName || "").toLowerCase().includes(q) ||
      (o.driveFolderName || "").toLowerCase().includes(q) ||
      (o.customerEmail || "").toLowerCase().includes(q)
    );
  });

  return (
    <AdminLayout>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "12px" }}>
          <FolderOpen size={24} /> File Vault
        </h1>
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", marginTop: "6px" }}>
          Each PO has its own Google Drive folder named{" "}
          <code style={{ background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: "4px" }}>
            Date.Company.Contact
          </code>
          {" "}under the Sideline client-vault root.
        </p>
      </div>

      {data && !data.configured && (
        <div style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)", borderRadius: "10px", padding: "14px 18px", marginBottom: "20px", display: "flex", gap: "10px", alignItems: "center" }}>
          <AlertTriangle size={18} style={{ color: "#eab308" }} />
          <span style={{ fontSize: "13px", color: "#eab308" }}>
            Google Drive is not configured. Set <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, <code>GOOGLE_REFRESH_TOKEN</code>, and <code>SIDELINE_DRIVE_PARENT_FOLDER_ID</code> in env to enable folder auto-create.
          </span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: "20px", alignItems: "flex-start" }}>
        {/* LEFT: PO list */}
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 200px)" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.3)" }} />
              <input
                type="text"
                placeholder="Search POs, companies, folders..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "8px 10px 8px 32px",
                  fontSize: "12px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "6px",
                  color: "#fff",
                  outline: "none",
                }}
              />
            </div>
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {isLoading ? (
              <div style={{ padding: "24px", textAlign: "center", fontSize: "13px", color: "rgba(255,255,255,0.3)" }}>Loading…</div>
            ) : !filtered.length ? (
              <div style={{ padding: "24px", textAlign: "center", fontSize: "13px", color: "rgba(255,255,255,0.3)" }}>No POs found</div>
            ) : (
              filtered.map((o) => {
                const isSelected = selected?.id === o.id;
                const contact = [o.customerFirstName, o.customerLastName].filter(Boolean).join(" ");
                return (
                  <button
                    key={o.id}
                    onClick={() => setSelected(o)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "12px 16px",
                      background: isSelected ? "rgba(249,115,22,0.08)" : "transparent",
                      border: "none",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      borderLeft: isSelected ? "3px solid #f97316" : "3px solid transparent",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      {o.driveFolderId ? (
                        <Folder size={13} style={{ color: "#22c55e" }} />
                      ) : (
                        <Folder size={13} style={{ color: "rgba(255,255,255,0.2)" }} />
                      )}
                      <span style={{ fontSize: "13px", fontWeight: 600, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                        {o.poReference || o.orderNumber}
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>
                      {o.accountName || "—"}
                    </div>
                    {contact && (
                      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>
                        {contact}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT: Files */}
        <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "12px", padding: "20px 24px", minHeight: "400px" }}>
          {!selected ? (
            <div style={{ textAlign: "center", padding: "80px 20px", color: "rgba(255,255,255,0.35)", fontSize: "13px" }}>
              Select a PO to view its Drive folder contents.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "18px", gap: "16px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
                    {selected.poReference || selected.orderNumber}
                  </div>
                  <h2 style={{ fontSize: "18px", fontWeight: 600, color: "#fff" }}>
                    {selected.driveFolderName || selected.accountName || "Untitled"}
                  </h2>
                  <Link href={`/admin/orders/${selected.id}`}>
                    <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", cursor: "pointer", textDecoration: "underline" }}>
                      View full order →
                    </span>
                  </Link>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {selected.driveFolderUrl ? (
                    <a
                      href={selected.driveFolderUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: "8px 14px",
                        fontSize: "12px",
                        fontWeight: 600,
                        background: "#fff",
                        color: "#000",
                        borderRadius: "6px",
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      Open in Drive <ExternalLink size={12} />
                    </a>
                  ) : (
                    <button
                      onClick={() => createFolderMutation.mutate(selected.id)}
                      disabled={createFolderMutation.isPending}
                      style={{
                        padding: "8px 14px",
                        fontSize: "12px",
                        fontWeight: 600,
                        background: "#22c55e",
                        color: "#000",
                        border: "none",
                        borderRadius: "6px",
                        cursor: "pointer",
                      }}
                    >
                      <RefreshCw size={12} style={{ display: "inline", marginRight: "4px" }} />
                      Create folder
                    </button>
                  )}
                </div>
              </div>

              {/* Breadcrumbs — reflect the Drive folder hierarchy */}
              {selected.driveFolderId && crumbs.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "14px", padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: "6px" }}>
                  {crumbs.map((c, i) => {
                    const isLast = i === crumbs.length - 1;
                    return (
                      <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        {i > 0 && <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.3)" }} />}
                        <button
                          onClick={() => {
                            if (!isLast) setCrumbs(crumbs.slice(0, i + 1));
                          }}
                          disabled={isLast}
                          style={{
                            background: "none",
                            border: "none",
                            color: isLast ? "#fff" : "rgba(255,255,255,0.6)",
                            fontSize: "12px",
                            fontWeight: isLast ? 600 : 400,
                            cursor: isLast ? "default" : "pointer",
                            padding: 0,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                          }}
                        >
                          {i === 0 && <Home size={11} />}
                          {c.name}
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {filesLoading ? (
                <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: "13px" }}>Loading files…</div>
              ) : filesData?.missing || !selected.driveFolderId ? (
                <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>
                  No Drive folder linked to this PO yet.
                </div>
              ) : !filesData?.files?.length ? (
                <div style={{ padding: "40px", textAlign: "center", color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>
                  This folder is empty. Drop files into Drive and refresh.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                  {/* Sub-folders */}
                  {folders.length > 0 && (
                    <div>
                      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(255,255,255,0.35)", marginBottom: "8px" }}>
                        Folders ({folders.length})
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "8px" }}>
                        {folders.map((f) => (
                          <button
                            key={f.id}
                            onClick={() => setCrumbs([...crumbs, { id: f.id, name: f.name }])}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              padding: "12px 14px",
                              borderRadius: "8px",
                              background: "rgba(249,115,22,0.06)",
                              border: "1px solid rgba(249,115,22,0.2)",
                              cursor: "pointer",
                              color: "#fff",
                              textAlign: "left",
                            }}
                          >
                            <Folder size={15} style={{ color: "#f97316", flexShrink: 0 }} />
                            <span style={{ fontSize: "13px", fontWeight: 500, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {f.name}
                            </span>
                            <ChevronRight size={12} style={{ color: "rgba(255,255,255,0.3)" }} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Files */}
                  {files.length > 0 && (
                    <div>
                      <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(255,255,255,0.35)", marginBottom: "8px" }}>
                        Files ({files.length})
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        {files.map((f) => (
                          <a
                            key={f.id}
                            href={f.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              padding: "10px 12px",
                              borderRadius: "6px",
                              background: "rgba(255,255,255,0.02)",
                              border: "1px solid rgba(255,255,255,0.04)",
                              textDecoration: "none",
                              color: "#fff",
                            }}
                          >
                            {f.iconLink ? (
                              <img src={f.iconLink} alt="" style={{ width: "16px", height: "16px" }} />
                            ) : (
                              <FileText size={14} style={{ color: "rgba(255,255,255,0.4)" }} />
                            )}
                            <span style={{ fontSize: "13px", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {f.name}
                            </span>
                            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)" }}>
                              {f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : ""}
                            </span>
                            <ExternalLink size={12} style={{ color: "rgba(255,255,255,0.3)" }} />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

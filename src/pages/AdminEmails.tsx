import { Outlet, useLocation, useNavigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";

const topLevelTabs = [
  { key: "users", label: "Users", path: "/admin/users?tab=users" },
  { key: "blog", label: "Blog", path: "/admin/users?tab=blog" },
  { key: "agencies", label: "Agencies", path: "/admin/users?tab=agencies" },
  { key: "payments", label: "Payments", path: "/admin/users?tab=payments" },
  { key: "mailing", label: "Mailing", path: "/admin/emails" },
] as const;

const subTabs = [
  { to: "/admin/emails/templates", label: "Templates" },
  { to: "/admin/emails/campaigns", label: "Campaigns" },
  { to: "/admin/emails/contacts", label: "Contacts" },
  { to: "/admin/emails/logs", label: "Logs" },
] as const;

/**
 * Flatten top-level tabs + mailing subtabs into one list for the mobile
 * dropdown so admins can jump anywhere in one interaction instead of two.
 */
const mobileRoutes = [
  ...topLevelTabs.slice(0, 4).map((t) => ({ value: t.path, label: t.label })),
  ...subTabs.map((s) => ({ value: s.to, label: `Mailing · ${s.label}` })),
];

export default function AdminEmails() {
  const loc = useLocation();
  const navigate = useNavigate();
  const isOnCampaigns = loc.pathname.startsWith("/admin/emails/campaigns");

  return (
    <AppShell>
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-8 space-y-4 overflow-x-hidden">
        {/* Mobile: shadcn Select unified nav ─────────────────────────── */}
        <div className="sm:hidden">
          <h1 className="text-xl font-extrabold tracking-tight mb-2">Admin</h1>
          <Select
            value={loc.pathname + (loc.search || "")}
            onValueChange={(value) => navigate(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Navigate…" />
            </SelectTrigger>
            <SelectContent>
              {mobileRoutes.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Desktop: 2-row nav ─────────────────────────────────────────── */}
        <div className="hidden sm:flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 min-w-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Admin</h1>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto -mx-1 px-1 scrollbar-none min-w-0">
            {topLevelTabs.map((t) => {
              const isActive = t.key === "mailing";
              return (
                <button
                  key={t.key}
                  onClick={() => navigate(t.path)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize whitespace-nowrap flex-shrink-0 ${
                    isActive
                      ? "bg-[#CFFF16]/10 text-black dark:text-[#CFFF16] border border-[#CFFF16]/20"
                      : "text-foreground/60 dark:text-exclu-space hover:text-foreground dark:hover:text-exclu-cloud hover:bg-foreground/5 dark:hover:bg-exclu-arsenic/20"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sub-tabs row with inline action button (New campaign on /campaigns) */}
        <div className="hidden sm:flex items-center justify-between gap-2">
          <div className="flex gap-1 rounded-xl bg-muted/30 p-1 overflow-x-auto scrollbar-none w-fit">
            {subTabs.map((t) => {
              const isActive = loc.pathname.startsWith(t.to);
              return (
                <button
                  key={t.to}
                  onClick={() => navigate(t.to)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          {isOnCampaigns && !loc.pathname.includes("/new") && !loc.pathname.match(/campaigns\/[^/]+$/) && (
            <Button
              onClick={() => navigate("/admin/emails/campaigns/new")}
              variant="hero"
              size="sm"
              className="flex-shrink-0"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New campaign
            </Button>
          )}
        </div>

        {/* Mobile "New campaign" — below nav dropdown when on campaigns list */}
        {isOnCampaigns && !loc.pathname.includes("/new") && !loc.pathname.match(/campaigns\/[^/]+$/) && (
          <div className="sm:hidden">
            <Button
              onClick={() => navigate("/admin/emails/campaigns/new")}
              variant="hero"
              size="sm"
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New campaign
            </Button>
          </div>
        )}

        <Outlet />
      </main>
    </AppShell>
  );
}

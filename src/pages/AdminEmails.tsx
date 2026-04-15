import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";

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
];

export default function AdminEmails() {
  const loc = useLocation();
  const navigate = useNavigate();

  return (
    <AppShell>
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-8 space-y-6 overflow-x-hidden">
        {/* Top-level admin tabs — mirror of AdminUsers, keeps "Mailing" active here */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 min-w-0">
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
                      ? 'bg-[#CFFF16]/10 text-black dark:text-[#CFFF16] border border-[#CFFF16]/20'
                      : 'text-foreground/60 dark:text-exclu-space hover:text-foreground dark:hover:text-exclu-cloud hover:bg-foreground/5 dark:hover:bg-exclu-arsenic/20'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sub-tabs for the emails section */}
        <div>
          <h2 className="text-xl font-semibold mb-3">Emails</h2>
          <nav className="flex gap-2 flex-wrap">
            {subTabs.map((t) => (
              <Link key={t.to} to={t.to}>
                <Button variant={loc.pathname.startsWith(t.to) ? "default" : "outline"}>
                  {t.label}
                </Button>
              </Link>
            ))}
          </nav>
        </div>

        <Outlet />
      </main>
    </AppShell>
  );
}

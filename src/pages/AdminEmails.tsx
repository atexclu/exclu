import { Link, Outlet, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

const tabs = [
  { to: "/admin/emails/templates", label: "Templates" },
  { to: "/admin/emails/campaigns", label: "Campaigns" },
  { to: "/admin/emails/contacts", label: "Contacts" },
  { to: "/admin/emails/logs", label: "Logs" },
];

export default function AdminEmails() {
  const loc = useLocation();
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Emails</h1>
      <nav className="flex gap-2">
        {tabs.map((t) => (
          <Link key={t.to} to={t.to}>
            <Button variant={loc.pathname.startsWith(t.to) ? "default" : "outline"}>
              {t.label}
            </Button>
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}

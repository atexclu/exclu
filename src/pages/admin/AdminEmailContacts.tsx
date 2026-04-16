import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  adminContacts,
  type AccountFilter,
  type RoleFilter,
  type MailingContactRow,
} from "@/lib/adminEmails";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Download, Loader2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useDebounce } from "use-debounce";

const PAGE_SIZE = 50;

function formatSource(source: string): string {
  return source
    .replace(/^backfill_/, "backfill → ")
    .replace(/_/g, " ");
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function AdminEmailContacts() {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [marketingOnly, setMarketingOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const queryKey = [
    "admin-mailing-contacts",
    { page, search: debouncedSearch, accountFilter, roleFilter, marketingOnly },
  ] as const;

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () =>
      adminContacts.list({
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch.trim() || undefined,
        accountFilter,
        roleFilter,
        marketingOnly: marketingOnly || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      await adminContacts.exportCsv({
        search: debouncedSearch.trim() || undefined,
        accountFilter,
        roleFilter,
        marketingOnly: marketingOnly || undefined,
      });
      toast.success("CSV export downloaded");
    } catch (err) {
      toast.error("Export failed: " + (err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const facets = data?.facets;

  return (
    <div className="space-y-4">
      {/* Facet summary */}
      {facets && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg border border-border bg-card px-3 py-1.5">
            <span className="text-muted-foreground">With account:</span>{" "}
            <strong>{facets.withAccount.toLocaleString()}</strong>
          </span>
          <span className="rounded-lg border border-border bg-card px-3 py-1.5">
            <span className="text-muted-foreground">Email only (no account):</span>{" "}
            <strong>{facets.emailOnly.toLocaleString()}</strong>
          </span>
          <span className="rounded-lg border border-border bg-card px-3 py-1.5">
            <span className="text-muted-foreground">Total matching filter:</span>{" "}
            <strong>{total.toLocaleString()}</strong>
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-8"
          />
        </div>
        <select
          value={accountFilter}
          onChange={(e) => {
            setAccountFilter(e.target.value as AccountFilter);
            setPage(1);
          }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All contacts</option>
          <option value="with_account">With account</option>
          <option value="email_only">Email only (no account)</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value as RoleFilter);
            setPage(1);
          }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All roles</option>
          <option value="fan">Fan</option>
          <option value="creator">Creator</option>
          <option value="agency">Agency</option>
          <option value="chatter">Chatter</option>
          <option value="unknown">Unknown</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={marketingOnly}
            onChange={(e) => {
              setMarketingOnly(e.target.checked);
              setPage(1);
            }}
            className="accent-primary"
          />
          Opted in only
        </label>
        <Button
          onClick={handleExportCsv}
          disabled={exporting || total === 0}
          variant="outline"
          size="sm"
          className="flex-shrink-0"
        >
          {exporting ? (
            <>
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              Exporting…
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-1.5" />
              Export CSV
            </>
          )}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load contacts: {(error as Error).message}
        </div>
      )}

      {/* Table (desktop) + cards (mobile) */}
      {isLoading && !data ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading contacts…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded border border-border p-8 text-center text-sm text-muted-foreground">
          No contacts match this filter.
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {rows.map((c) => (
              <ContactCard key={c.email} contact={c} />
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block rounded border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>First source</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead>First seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.email}>
                    <TableCell className="font-mono text-xs">
                      {c.email}
                      {c.display_name && (
                        <div className="text-[11px] text-muted-foreground font-sans">
                          {c.display_name}
                          {c.profile_handle && ` · @${c.profile_handle}`}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <AccountBadge contact={c} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {c.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatSource(c.first_source)}
                    </TableCell>
                    <TableCell className="text-xs">{formatRelative(c.last_seen_at)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatRelative(c.first_seen_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              Page {page} of {totalPages} · {total.toLocaleString()} contacts
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AccountBadge({ contact }: { contact: MailingContactRow }) {
  if (contact.has_account) {
    return (
      <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 hover:bg-green-500/25 text-[10px]">
        Account
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground">
      Email only
    </Badge>
  );
}

function ContactCard({ contact }: { contact: MailingContactRow }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-xs break-all">{contact.email}</div>
          {contact.display_name && (
            <div className="text-[11px] text-muted-foreground">
              {contact.display_name}
              {contact.profile_handle && ` · @${contact.profile_handle}`}
            </div>
          )}
        </div>
        <AccountBadge contact={contact} />
      </div>
      <div className="flex flex-wrap items-center gap-1 text-[10px]">
        <Badge variant="outline" className="capitalize">
          {contact.role}
        </Badge>
        <span className="text-muted-foreground">
          from {formatSource(contact.first_source)}
        </span>
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>First: {formatRelative(contact.first_seen_at)}</span>
        <span>Last: {formatRelative(contact.last_seen_at)}</span>
      </div>
    </div>
  );
}

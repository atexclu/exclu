import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { adminEmails, type EmailTemplateListRow } from "@/lib/adminEmails";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export default function AdminEmailTemplates() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-email-templates"],
    queryFn: () => adminEmails.list(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading templates…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load templates: {(error as Error).message}
      </div>
    );
  }

  const templates: EmailTemplateListRow[] = data?.templates ?? [];

  if (templates.length === 0) {
    return (
      <div className="rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/80 p-6 text-sm text-muted-foreground">
        No templates yet.
      </div>
    );
  }

  const openTemplate = (slug: string) => navigate(`/admin/emails/templates/${slug}`);

  return (
    <>
      {/* Mobile: stacked cards */}
      <div className="space-y-3 md:hidden">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => openTemplate(t.slug)}
            className="block w-full text-left rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/80 p-4 transition-colors duration-200 hover:bg-exclu-ink"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate text-exclu-cloud">{t.name}</div>
                <code className="text-[11px] text-muted-foreground break-all">{t.slug}</code>
              </div>
              <Badge variant="secondary" className="flex-shrink-0 text-[10px]">
                {t.category}
              </Badge>
            </div>
            <div className="mt-2 text-sm text-muted-foreground line-clamp-2">{t.subject}</div>
          </button>
        ))}
      </div>

      {/* Desktop: clickable rows, no Updated/Edit columns */}
      <div className="hidden md:block rounded-2xl border border-exclu-arsenic/70 bg-exclu-ink/80 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-exclu-arsenic/40 hover:bg-transparent">
              <TableHead className="text-exclu-space">Name</TableHead>
              <TableHead className="text-exclu-space">Slug</TableHead>
              <TableHead className="text-exclu-space">Category</TableHead>
              <TableHead className="text-exclu-space">Subject</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((t, i) => (
              <TableRow
                key={t.id}
                onClick={() => openTemplate(t.slug)}
                className={`cursor-pointer border-b border-exclu-arsenic/30 hover:bg-exclu-ink/50 transition-colors duration-200 ${
                  i === templates.length - 1 ? "border-b-0" : ""
                }`}
              >
                <TableCell className="font-medium text-exclu-cloud">{t.name}</TableCell>
                <TableCell>
                  <code className="text-xs text-muted-foreground">{t.slug}</code>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-[10px]">
                    {t.category}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">
                  {t.subject}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

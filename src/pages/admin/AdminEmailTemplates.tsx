import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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

function formatRelative(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function AdminEmailTemplates() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-email-templates"],
    queryFn: () => adminEmails.list(),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading templates…</div>;
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
      <div className="rounded border border-border p-6 text-sm text-muted-foreground">
        No templates yet. Seed migration 132 should have inserted the defaults.
      </div>
    );
  }

  return (
    <div className="rounded border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">{t.name}</TableCell>
              <TableCell>
                <code className="text-xs">{t.slug}</code>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{t.category}</Badge>
              </TableCell>
              <TableCell className="max-w-xs truncate text-muted-foreground">
                {t.subject}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {formatRelative(t.updated_at)}
              </TableCell>
              <TableCell className="text-right">
                <Link
                  to={`/admin/emails/templates/${t.slug}`}
                  className="text-sm text-primary underline"
                >
                  Edit
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

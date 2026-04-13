import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Building2, Eye, EyeOff, Pencil, Trash2, Loader2, X, Save } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AppShell from '@/components/AppShell';
import { toast } from 'sonner';

interface DirectoryAgency {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  website_url: string | null;
  contact_email: string | null;
  country: string;
  city: string | null;
  services: string[];
  creator_profile_ids: string[];
  is_visible: boolean;
  is_featured: boolean;
  sort_order: number;
}

const emptyAgency: Omit<DirectoryAgency, 'id'> = {
  slug: '',
  name: '',
  logo_url: null,
  description: null,
  website_url: null,
  contact_email: null,
  country: '',
  city: null,
  services: [],
  creator_profile_ids: [],
  is_visible: true,
  is_featured: false,
  sort_order: 0,
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 200);
}

const AdminAgencies = () => {
  const [agencies, setAgencies] = useState<DirectoryAgency[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<DirectoryAgency, 'id'>>(emptyAgency);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchAgencies = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const res = await supabase.functions.invoke('admin-manage-agencies', {
      headers: { 'x-supabase-auth': session.access_token },
      body: { action: 'list' },
    });
    if (res.data?.agencies) setAgencies(res.data.agencies);
    setLoading(false);
  };

  useEffect(() => { fetchAgencies(); }, []);

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.country.trim()) {
      toast.error('Name and country are required');
      return;
    }

    setSaving(true);
    const payload = {
      action: editingId ? 'update' : 'create',
      ...(editingId && { id: editingId }),
      ...formData,
      slug: formData.slug || slugify(formData.name),
      services: typeof formData.services === 'string'
        ? (formData.services as unknown as string).split(',').map((s: string) => s.trim()).filter(Boolean)
        : formData.services,
    };

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSaving(false); return; }
    const res = await supabase.functions.invoke('admin-manage-agencies', {
      headers: { 'x-supabase-auth': session.access_token },
      body: payload,
    });
    if (res.error) {
      toast.error('Save failed');
    } else {
      toast.success(editingId ? 'Agency updated' : 'Agency created');
      setShowForm(false);
      setEditingId(null);
      setFormData(emptyAgency);
      fetchAgencies();
    }
    setSaving(false);
  };

  const handleToggleVisibility = async (agency: DirectoryAgency) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await supabase.functions.invoke('admin-manage-agencies', {
      headers: { 'x-supabase-auth': session.access_token },
      body: { action: 'update', id: agency.id, is_visible: !agency.is_visible },
    });
    if (!res.error) {
      toast.success(agency.is_visible ? 'Agency hidden' : 'Agency visible');
      fetchAgencies();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this agency permanently?')) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await supabase.functions.invoke('admin-manage-agencies', {
      headers: { 'x-supabase-auth': session.access_token },
      body: { action: 'delete', id },
    });
    if (!res.error) {
      toast.success('Agency deleted');
      fetchAgencies();
    }
  };

  const startEdit = (agency: DirectoryAgency) => {
    setEditingId(agency.id);
    setFormData({
      slug: agency.slug,
      name: agency.name,
      logo_url: agency.logo_url,
      description: agency.description,
      website_url: agency.website_url,
      contact_email: agency.contact_email,
      country: agency.country,
      city: agency.city,
      services: agency.services,
      creator_profile_ids: agency.creator_profile_ids,
      is_visible: agency.is_visible,
      is_featured: agency.is_featured,
      sort_order: agency.sort_order,
    });
    setShowForm(true);
  };

  const filtered = agencies.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.country.toLowerCase().includes(q);
  });

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Agencies Directory</h1>
            <p className="text-sm text-muted-foreground mt-1">{agencies.length} agenc{agencies.length !== 1 ? 'ies' : 'y'}</p>
          </div>
          <Button onClick={() => { setShowForm(true); setEditingId(null); setFormData(emptyAgency); }} className="gap-2 w-full sm:w-auto">
            <Plus className="w-4 h-4" /> Add Agency
          </Button>
        </div>

        {/* Form modal */}
        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 rounded-xl border border-border/50 bg-card p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{editingId ? 'Edit Agency' : 'New Agency'}</h2>
              <button onClick={() => { setShowForm(false); setEditingId(null); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Name *</label>
                <Input value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value, slug: editingId ? p.slug : slugify(e.target.value) }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Slug</label>
                <Input value={formData.slug} onChange={(e) => setFormData((p) => ({ ...p, slug: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Country *</label>
                <Input value={formData.country} onChange={(e) => setFormData((p) => ({ ...p, country: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">City</label>
                <Input value={formData.city || ''} onChange={(e) => setFormData((p) => ({ ...p, city: e.target.value || null }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Website</label>
                <Input value={formData.website_url || ''} onChange={(e) => setFormData((p) => ({ ...p, website_url: e.target.value || null }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Contact Email</label>
                <Input value={formData.contact_email || ''} onChange={(e) => setFormData((p) => ({ ...p, contact_email: e.target.value || null }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Logo URL</label>
                <Input value={formData.logo_url || ''} onChange={(e) => setFormData((p) => ({ ...p, logo_url: e.target.value || null }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Services (comma-separated)</label>
                <Input
                  value={Array.isArray(formData.services) ? formData.services.join(', ') : formData.services}
                  onChange={(e) => setFormData((p) => ({ ...p, services: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))}
                  placeholder="management, marketing, booking"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-muted-foreground block mb-1">Description</label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value || null }))}
                  rows={3}
                  className="w-full px-3 py-2 bg-background border border-border/50 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editingId ? 'Update' : 'Create'}
              </Button>
            </div>
          </motion.div>
        )}

        {/* Search */}
        <div className="relative mb-6 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search agencies..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border/50 p-4 animate-pulse">
                <div className="h-5 bg-muted rounded w-1/3 mb-2" />
                <div className="h-3 bg-muted rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No agencies yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((agency) => (
              <motion.div
                key={agency.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="group rounded-xl border border-border/50 bg-card/50 hover:bg-card/80 transition-colors p-4"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {agency.logo_url ? (
                      <img src={agency.logo_url} alt={agency.name} className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                        {agency.name[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{agency.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {agency.country}{agency.city ? `, ${agency.city}` : ''} · {agency.creator_profile_ids.length} creators
                        {!agency.is_visible && <span className="ml-2 text-amber-400">(hidden)</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(agency)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggleVisibility(agency)}>
                      {agency.is_visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-400" onClick={() => handleDelete(agency.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default AdminAgencies;

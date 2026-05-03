import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { maybeConvertHeic } from '@/lib/convertHeic';
import { getSignedUrls } from '@/lib/storageUtils';
import { useProfiles } from '@/contexts/ProfileContext';

interface LinkRow {
  id: string;
  title: string;
  slug: string;
  price_cents: number;
  currency: string;
  status: string;
  show_on_profile: boolean;
  created_at: string;
  click_count?: number;
  storage_path: string | null;
  previewUrl?: string | null;
  isVideo?: boolean;
  is_public: boolean;
}

const CreatorLinks = () => {
  const { activeProfile } = useProfiles();
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadPrice, setUploadPrice] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canCreateLinks, setCanCreateLinks] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    const fetchLinks = async () => {
      setIsLoading(true);
      setError(null);
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        if (!isMounted) return;
        setError('You must be signed in to view your links.');
        setLinks([]);
        setIsLoading(false);
        return;
      }

      // Links are always accessible — payment provider will be configured separately
      setCanCreateLinks(true);

      const linksQuery = supabase
        .from('links')
        .select('id, title, slug, price_cents, currency, status, show_on_profile, created_at, click_count, storage_path, is_public')
        .order('created_at', { ascending: false });

      const { data, error } = activeProfile?.id
        ? await linksQuery.eq('profile_id', activeProfile.id)
        : await linksQuery.eq('creator_id', user.id);

      if (!isMounted) return;

      if (error) {
        console.error('Error loading links', error);
        setError('Unable to load your links. Please try again later.');
      } else {
        const baseLinks = (data ?? []) as LinkRow[];

        // Direct preview signing + fallback link_media query run in parallel —
        // both only depend on baseLinks. Saves one RTT vs the previous chain.
        const directPaths = baseLinks
          .map((l) => l.storage_path)
          .filter(Boolean) as string[];
        const allLinkIds = baseLinks.map((l) => l.id);

        const [directSigned, mediaRes] = await Promise.all([
          getSignedUrls(directPaths, 60 * 60),
          allLinkIds.length > 0
            ? supabase
                .from('link_media')
                .select('link_id, position, assets(storage_path, mime_type)')
                .in('link_id', allLinkIds)
                .order('position', { ascending: true })
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const fallbackByLink: Record<string, { storage_path: string; mime_type?: string | null }> = {};
        for (const row of (mediaRes.data ?? []) as Array<{ link_id: string; assets: { storage_path: string; mime_type?: string | null } | null }>) {
          if (!fallbackByLink[row.link_id] && row.assets?.storage_path) {
            fallbackByLink[row.link_id] = row.assets;
          }
        }
        // Only sign fallback paths actually needed — when the direct preview
        // already worked we don't bother.
        const fallbackPathsNeeded = baseLinks
          .filter((l) => !l.storage_path || !directSigned[l.storage_path])
          .map((l) => fallbackByLink[l.id]?.storage_path)
          .filter(Boolean) as string[];
        const fallbackSigned = await getSignedUrls(fallbackPathsNeeded, 60 * 60);

        const withPreviews = baseLinks.map((link) => {
          if (link.storage_path && directSigned[link.storage_path]) {
            const ext = link.storage_path.split('.').pop()?.toLowerCase() ?? '';
            const isVideo = ['mp4', 'mov', 'webm', 'mkv'].includes(ext);
            return { ...link, previewUrl: directSigned[link.storage_path], isVideo };
          }
          const fb = fallbackByLink[link.id];
          if (fb && fallbackSigned[fb.storage_path]) {
            return {
              ...link,
              previewUrl: fallbackSigned[fb.storage_path],
              isVideo: fb.mime_type?.startsWith('video/') || false,
            };
          }
          return { ...link, previewUrl: null, isVideo: false };
        });

        setLinks(withPreviews);

        if (withPreviews.length === 0) {
          navigate('/app/links/new', { replace: true });
        }
      }
      setIsLoading(false);
    };

    fetchLinks();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleUpload = async () => {
    if (!uploadFile) {
      toast.error('Please select a file to upload');
      return;
    }

    setIsUploading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('You must be logged in');
      setIsUploading(false);
      return;
    }

    const userId = user.id;
    const convertedFile = await maybeConvertHeic(uploadFile);
    const filePath = `paid-content/${userId}/${convertedFile.name}`;

    const { data, error } = await supabase.storage
      .from('paid-content')
      .upload(filePath, convertedFile, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      setIsUploading(false);
      toast.error('Failed to upload file');
      return;
    }

    const { data: insertData, error: insertError } = await supabase
      .from('links')
      .insert({
        creator_id: userId,
        profile_id: activeProfile?.id || null,
        title: uploadTitle,
        price: parseFloat(uploadPrice),
        description: uploadDescription || null,
        storage_path: filePath,
        mime_type: uploadFile.type,
        status: 'published',
        is_public: isPublic,
      })
      .select()
      .single();

    if (insertError) {
      setIsUploading(false);
      toast.error('Failed to create link');
      return;
    }

    toast.success('Content created successfully!');
    setUploadFile(null);
    setUploadTitle('');
    setUploadPrice('');
    setUploadDescription('');
    setIsPublic(false);
    setIsUploadModalOpen(false);
    setIsUploading(false);

    // Refresh the list
    window.location.reload();
  };

  return (
    <AppShell>
      <main className="px-4 lg:px-6 pb-16 w-full">
        <section className="mt-4 sm:mt-6 mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-exclu-cloud mb-1">
              Your links
            </h1>
            <p className="text-exclu-space text-xs sm:text-sm max-w-xl">
              Create and manage the links your fans will pay to unlock.
            </p>
          </div>
          <Button asChild variant="hero" size="sm">
            <RouterLink to="/app/links/new">New link</RouterLink>
          </Button>
        </section>

        {isLoading && (
          <p className="text-sm text-exclu-space">Loading your links...</p>
        )}

        {error && !isLoading && (
          <p className="text-sm text-red-400 mb-4">{error}</p>
        )}

        {!isLoading && !error && links.length === 0 && canCreateLinks === true && (
          <p className="text-sm text-exclu-space/80">
            You don&apos;t have any links yet. Click "New link" to create your first one.
          </p>
        )}

        {!isLoading && !error && links.length > 0 && canCreateLinks === true && (
          <>
            {/* Mobile: Card layout */}
            <div className="sm:hidden space-y-3">
              {links.map((link) => (
                <div
                  key={link.id}
                  onClick={() => navigate(`/app/links/${link.id}`)}
                  className="rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80 p-4 cursor-pointer hover:bg-exclu-ink"
                >
                  <div className="flex gap-3">
                    {/* Thumbnail */}
                    <div className="relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-exclu-arsenic/60 bg-exclu-ink/80">
                      {link.previewUrl ? (
                        link.isVideo ? (
                          <video
                            src={link.previewUrl}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                          />
                        ) : (
                          <img
                            src={link.previewUrl}
                            className="w-full h-full object-cover"
                            alt={link.title}
                          />
                        )
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-exclu-phantom/30 via-exclu-ink to-exclu-phantom/20" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <RouterLink
                        to={`/app/links/${link.id}`}
                        className="text-sm font-medium text-exclu-cloud hover:underline truncate block"
                      >
                        {link.title}
                      </RouterLink>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm font-semibold text-exclu-cloud">
                          {link.price_cents / 100} {link.currency}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-exclu-space/70">
                        <span>{new Date(link.created_at).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>{link.click_count ?? 0} clicks</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-exclu-arsenic/40">
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const url = `${window.location.origin}/l/${link.slug}`;
                        try {
                          await navigator.clipboard.writeText(url);
                          toast.success('Link copied!');
                        } catch {
                          toast.error('Failed to copy link');
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-exclu-arsenic/30 hover:bg-exclu-arsenic/50 text-xs text-exclu-space transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy link
                    </button>
                    <div
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-exclu-ink border border-exclu-arsenic/40"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="text-[10px] text-exclu-space/70">Visible</span>
                      <Switch
                        checked={link.show_on_profile}
                        onCheckedChange={async (checked) => {
                          const { error } = await supabase
                            .from('links')
                            .update({ show_on_profile: checked })
                            .eq('id', link.id);
                          if (error) {
                            toast.error('Failed to update visibility');
                          } else {
                            toast.success(checked ? 'Link is now visible' : 'Link is now hidden');
                            setLinks(links.map(l => l.id === link.id ? { ...l, show_on_profile: checked } : l));
                          }
                        }}
                      />
                    </div>
                    <RouterLink
                      to={`/app/links/${link.id}/edit`}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-exclu-cloud/10 hover:bg-exclu-cloud/20 text-xs text-exclu-cloud transition-colors"
                    >
                      Edit
                    </RouterLink>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: Table layout */}
            <div className="hidden sm:block overflow-x-auto rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80">
              <table className="min-w-full text-sm">
                <thead className="text-xs uppercase text-exclu-space/70 border-b border-exclu-arsenic/60">
                  <tr>
                    <th className="px-4 py-3 text-left">Title</th>
                    <th className="px-4 py-3 text-left">Price</th>
                    <th className="px-4 py-3 text-left">Created</th>
                    <th className="px-4 py-3 text-left">Clicks</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => (
                    <tr
                      key={link.id}
                      className="border-t border-exclu-arsenic/40 hover:bg-exclu-ink/60 cursor-pointer"
                      onClick={() => navigate(`/app/links/${link.id}`)}
                    >
                      <td className="px-4 py-3 text-exclu-cloud font-medium">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Thumbnail preview */}
                          <div className="relative flex-shrink-0 w-14 h-10 rounded-xl overflow-hidden border border-exclu-arsenic/60 bg-exclu-ink/80">
                            {link.previewUrl ? (
                              link.isVideo ? (
                                <video
                                  src={link.previewUrl}
                                  className="w-full h-full object-cover"
                                  muted
                                  loop
                                  playsInline
                                />
                              ) : (
                                <img
                                  src={link.previewUrl}
                                  className="w-full h-full object-cover"
                                  alt={link.title}
                                />
                              )
                            ) : (
                              <div className="w-full h-full bg-gradient-to-br from-exclu-phantom/30 via-exclu-ink to-exclu-phantom/20" />
                            )}
                          </div>

                          {/* Title */}
                          <RouterLink
                            to={`/app/links/${link.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            className="min-w-0 hover:underline hover:text-exclu-cloud/90 transition-colors"
                          >
                            <span className="truncate block max-w-[180px] sm:max-w-[220px]">{link.title}</span>
                          </RouterLink>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-exclu-space">
                        {link.price_cents / 100} {link.currency}
                      </td>
                      <td className="px-4 py-3 text-exclu-space/80">
                        {new Date(link.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-exclu-space">
                        {link.click_count ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div
                            className="flex items-center gap-2 px-2 py-1 rounded-lg bg-exclu-ink border border-exclu-arsenic/40"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="text-[10px] text-exclu-space/70">Visible</span>
                            <Switch
                              checked={link.show_on_profile}
                              onCheckedChange={async (checked) => {
                                const { error } = await supabase
                                  .from('links')
                                  .update({ show_on_profile: checked })
                                  .eq('id', link.id);
                                if (error) {
                                  toast.error('Failed to update visibility');
                                } else {
                                  toast.success(checked ? 'Link is now visible' : 'Link is now hidden');
                                  setLinks(links.map(l => l.id === link.id ? { ...l, show_on_profile: checked } : l));
                                }
                              }}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const url = `${window.location.origin}/l/${link.slug}`;
                              try {
                                await navigator.clipboard.writeText(url);
                                toast.success('Link copied!');
                              } catch {
                                toast.error('Failed to copy link');
                              }
                            }}
                            className="p-1.5 rounded-lg hover:bg-exclu-arsenic/30 transition-colors"
                            title="Copy link"
                          >
                            <Copy className="w-4 h-4 text-exclu-space hover:text-primary" />
                          </button>
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="rounded-full border-exclu-arsenic/60 text-xs px-3 py-1 h-auto"
                          >
                            <RouterLink
                              to={`/app/links/${link.id}/edit`}
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                            >
                              Edit
                            </RouterLink>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </AppShell>
  );
};

export default CreatorLinks;

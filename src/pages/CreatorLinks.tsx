import AppShell from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

interface LinkRow {
  id: string;
  title: string;
  price_cents: number;
  currency: string;
  status: string;
  created_at: string;
  click_count?: number;
  storage_path: string | null;
  previewUrl?: string | null;
  isVideo?: boolean;
}

const CreatorLinks = () => {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;

    const fetchLinks = async () => {
      setIsLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from('links')
        .select('id, title, price_cents, currency, status, created_at, click_count, storage_path')
        .order('created_at', { ascending: false });

      if (!isMounted) return;

      if (error) {
        console.error('Error loading links', error);
        setError('Unable to load your links. Please try again later.');
      } else {
        const baseLinks = (data ?? []) as LinkRow[];

        // Generate signed URLs for media previews
        const withPreviews = await Promise.all(
          baseLinks.map(async (link) => {
            if (!link.storage_path) return { ...link, previewUrl: null, isVideo: false };

            const { data: signed, error: signedError } = await supabase.storage
              .from('paid-content')
              .createSignedUrl(link.storage_path, 60 * 60);

            if (signedError || !signed?.signedUrl) {
              console.error('Error generating preview URL for link', link.id, signedError);
              return { ...link, previewUrl: null, isVideo: false };
            }

            const ext = link.storage_path.split('.').pop()?.toLowerCase() ?? '';
            const isVideo = ['mp4', 'mov', 'webm', 'mkv'].includes(ext);

            return { ...link, previewUrl: signed.signedUrl, isVideo };
          })
        );

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

  return (
    <AppShell>
      <main className="px-4 pb-16 max-w-6xl mx-auto">
        <section className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-exclu-cloud mb-1">
              Your premium links
            </h1>
            <p className="text-exclu-space text-sm max-w-xl">
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

        {!isLoading && !error && links.length === 0 && (
          <p className="text-sm text-exclu-space/80">
            You don&apos;t have any links yet. Click "New link" to create your first one.
          </p>
        )}

        {!isLoading && !error && links.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-exclu-arsenic/60 bg-exclu-ink/80">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase text-exclu-space/70 border-b border-exclu-arsenic/60">
                <tr>
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="px-4 py-3 text-left">Price</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Created</th>
                  <th className="px-4 py-3 text-left">Clicks</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {links.map((link) => (
                  <tr key={link.id} className="border-t border-exclu-arsenic/40">
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
                          className="min-w-0 hover:underline hover:text-exclu-cloud/90 transition-colors"
                        >
                          <span className="truncate block max-w-[180px] sm:max-w-[220px]">{link.title}</span>
                        </RouterLink>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-exclu-space">
                      {link.price_cents / 100} {link.currency}
                    </td>
                    <td className="px-4 py-3 text-exclu-space capitalize">{link.status}</td>
                    <td className="px-4 py-3 text-exclu-space/80">
                      {new Date(link.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-exclu-space">
                      {link.click_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="rounded-full border-exclu-arsenic/60 text-xs px-3 py-1 h-auto"
                      >
                        <RouterLink to={`/app/links/${link.id}/edit`}>Edit</RouterLink>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AppShell>
  );
};

export default CreatorLinks;

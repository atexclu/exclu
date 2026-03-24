import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, Clock, User, Tag } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Aurora from '@/components/ui/Aurora';

interface BlogCategory {
  id: string;
  slug: string;
  name: string;
}

interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content_html: string | null;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  published_at: string | null;
  reading_time_minutes: number;
  author_name: string;
  author_url: string | null;
  tags: string[];
  meta_title: string | null;
  meta_description: string | null;
  blog_categories: BlogCategory | null;
}

const BlogArticle = () => {
  const { slug } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<Article | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;

    const fetchArticle = async () => {
      setLoading(true);
      setNotFound(false);

      const { data, error } = await supabase
        .from('blog_articles')
        .select('id, slug, title, excerpt, content_html, cover_image_url, cover_image_alt, published_at, reading_time_minutes, author_name, author_url, tags, meta_title, meta_description, blog_categories(id, slug, name)')
        .eq('slug', slug)
        .eq('status', 'published')
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
      } else {
        setArticle(data as unknown as Article);

        if (data.meta_title || data.title) {
          document.title = `${data.meta_title || data.title} — Exclu`;
        }
      }
      setLoading(false);
    };

    fetchArticle();
  }, [slug]);

  const formatDate = (date: string | null) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="dark min-h-screen bg-background text-foreground">
        <Navbar variant="blog" />
        <main className="pt-32 pb-24 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto">
            <div className="animate-pulse">
              <div className="h-4 bg-white/10 rounded w-32 mb-8" />
              <div className="h-64 bg-white/5 rounded-2xl mb-8" />
              <div className="h-3 bg-white/10 rounded w-24 mb-4" />
              <div className="h-8 bg-white/10 rounded w-full mb-3" />
              <div className="h-8 bg-white/10 rounded w-2/3 mb-6" />
              <div className="h-3 bg-white/10 rounded w-48 mb-10" />
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-4 bg-white/5 rounded" style={{ width: `${85 + Math.random() * 15}%` }} />
                ))}
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (notFound || !article) {
    return (
      <div className="dark min-h-screen bg-background text-foreground">
        <Navbar variant="blog" />
        <main className="pt-32 pb-24 px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto text-center py-20"
          >
            <p className="text-4xl mb-4">📝</p>
            <h1 className="text-2xl font-bold text-exclu-cloud mb-3">Article not found</h1>
            <p className="text-exclu-space mb-6">This article may have been removed or is not yet published.</p>
            <Link
              to="/blog"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-exclu-cloud hover:bg-white/10 transition-all"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Blog
            </Link>
          </motion.div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground overflow-x-hidden relative">
      {/* Aurora background */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-30">
        <Aurora colorStops={['#CFFF16', '#a3e635', '#CFFF16']} blend={0.5} amplitude={0.7} speed={0.6} />
      </div>
      <div className="fixed inset-0 pointer-events-none z-0 grid-pattern opacity-5" />

      <Navbar variant="blog" />

      <main className="relative z-10 pt-32 pb-24 px-4 sm:px-6">
        <article className="max-w-3xl mx-auto">
          {/* Breadcrumb */}
          <motion.nav
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-2 text-sm text-exclu-steel mb-8"
          >
            <Link to="/blog" className="hover:text-exclu-cloud transition-colors">Blog</Link>
            {article.blog_categories && (
              <>
                <span>/</span>
                <Link
                  to={`/blog/category/${article.blog_categories.slug}`}
                  className="hover:text-exclu-cloud transition-colors"
                >
                  {article.blog_categories.name}
                </Link>
              </>
            )}
          </motion.nav>

          {/* Cover image */}
          {article.cover_image_url && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="mb-8 rounded-2xl overflow-hidden"
            >
              <img
                src={article.cover_image_url}
                alt={article.cover_image_alt || article.title}
                className="w-full max-h-[420px] object-cover"
              />
            </motion.div>
          )}

          {/* Header */}
          <motion.header
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {article.blog_categories && (
              <Link
                to={`/blog/category/${article.blog_categories.slug}`}
                className="inline-block text-[11px] font-medium uppercase tracking-wider text-lime-400/80 hover:text-lime-400 transition-colors mb-3"
              >
                {article.blog_categories.name}
              </Link>
            )}
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-exclu-cloud leading-tight mb-4">
              {article.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-sm text-exclu-steel mb-8 pb-8 border-b border-white/5">
              {article.published_at && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {formatDate(article.published_at)}
                </span>
              )}
              {article.reading_time_minutes > 0 && (
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {article.reading_time_minutes} min read
                </span>
              )}
              {article.author_name && (
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  {article.author_url ? (
                    <a href={article.author_url} className="hover:text-exclu-cloud transition-colors" target="_blank" rel="noopener noreferrer">
                      {article.author_name}
                    </a>
                  ) : (
                    article.author_name
                  )}
                </span>
              )}
            </div>
          </motion.header>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="prose prose-invert prose-sm sm:prose-base max-w-none
              prose-headings:text-exclu-cloud prose-headings:font-bold
              prose-p:text-exclu-space prose-p:leading-relaxed
              prose-a:text-lime-400 prose-a:no-underline hover:prose-a:underline
              prose-strong:text-exclu-cloud
              prose-blockquote:border-lime-400/30 prose-blockquote:text-exclu-steel
              prose-code:bg-white/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
              prose-pre:bg-white/[0.03] prose-pre:border prose-pre:border-white/5
              prose-img:rounded-xl"
            dangerouslySetInnerHTML={{ __html: article.content_html || '<p>Content coming soon.</p>' }}
          />

          {/* Tags */}
          {article.tags?.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="flex flex-wrap gap-2 mt-10 pt-8 border-t border-white/5"
            >
              <Tag className="w-4 h-4 text-exclu-steel mt-0.5" />
              {article.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 rounded-full text-xs font-medium bg-white/5 text-exclu-space"
                >
                  {tag}
                </span>
              ))}
            </motion.div>
          )}

          {/* Author box */}
          {article.author_name && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-10 p-6 rounded-2xl border border-white/5 bg-white/[0.02]"
            >
              <p className="text-sm text-exclu-steel">
                Written by{' '}
                <span className="font-semibold text-exclu-cloud">
                  {article.author_url ? (
                    <a href={article.author_url} className="hover:text-lime-400 transition-colors" target="_blank" rel="noopener noreferrer">
                      {article.author_name}
                    </a>
                  ) : (
                    article.author_name
                  )}
                </span>
              </p>
            </motion.div>
          )}

          {/* Back to blog */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mt-10 text-center"
          >
            <Link
              to="/blog"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-exclu-cloud hover:bg-white/10 transition-all duration-200"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Blog
            </Link>
          </motion.div>
        </article>
      </main>

      <Footer />
    </div>
  );
};

export default BlogArticle;

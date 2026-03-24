import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, Clock, BookOpen, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Aurora from '@/components/ui/Aurora';

interface BlogCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  meta_title: string | null;
  meta_description: string | null;
}

interface BlogArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  reading_time_minutes: number;
}

const BlogCategoryPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [category, setCategory] = useState<BlogCategory | null>(null);
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;

    const fetchCategory = async () => {
      setLoading(true);
      setNotFound(false);

      const { data: cat, error: catError } = await supabase
        .from('blog_categories')
        .select('id, slug, name, description, meta_title, meta_description')
        .eq('slug', slug)
        .maybeSingle();

      if (catError || !cat) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setCategory(cat);

      if (cat.meta_title || cat.name) {
        document.title = `${cat.meta_title || cat.name} — Exclu Blog`;
      }

      const { data: arts } = await supabase
        .from('blog_articles')
        .select('id, slug, title, excerpt, cover_image_url, published_at, reading_time_minutes')
        .eq('category_id', cat.id)
        .eq('status', 'published')
        .order('published_at', { ascending: false });

      if (arts) setArticles(arts);
      setLoading(false);
    };

    fetchCategory();
  }, [slug]);

  const formatDate = (date: string | null) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="dark min-h-screen bg-background text-foreground">
        <Navbar variant="blog" />
        <main className="pt-32 pb-24 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="animate-pulse">
              <div className="h-4 bg-white/10 rounded w-24 mb-8" />
              <div className="h-8 bg-white/10 rounded w-48 mb-3" />
              <div className="h-4 bg-white/10 rounded w-96 mb-10" />
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
                    <div className="h-48 bg-white/5" />
                    <div className="p-5 space-y-3">
                      <div className="h-5 bg-white/10 rounded w-full" />
                      <div className="h-3 bg-white/10 rounded w-3/4" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (notFound || !category) {
    return (
      <div className="dark min-h-screen bg-background text-foreground">
        <Navbar variant="blog" />
        <main className="pt-32 pb-24 px-4 sm:px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto text-center py-20"
          >
            <p className="text-4xl mb-4">📂</p>
            <h1 className="text-2xl font-bold text-exclu-cloud mb-3">Category not found</h1>
            <p className="text-exclu-space mb-6">This category does not exist.</p>
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

      {/* Hero Section - same style as DirectoryHub */}
      <section className="relative z-10 pt-28 pb-16 overflow-hidden">
        <div className="absolute inset-0 radial-gradient opacity-30" />
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-white/5 rounded-full blur-[150px] animate-pulse-glow" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="text-center space-y-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="inline-flex items-center gap-2 glass px-4 py-2 rounded-full"
            >
              <FileText className="w-4 h-4 text-[#CFFF16]" />
              <span className="text-sm text-exclu-cloud font-medium">Blog Category</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold leading-[1.05] tracking-tight"
            >
              <span className="text-[#CFFF16]">{category.name}</span>
            </motion.h1>

            {category.description && (
              <motion.p
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="text-base sm:text-lg text-exclu-space max-w-2xl mx-auto leading-relaxed"
              >
                {category.description}
              </motion.p>
            )}
          </div>
        </div>
      </section>

      {/* Articles Section */}
      <main className="relative z-10 pb-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm text-exclu-space hover:text-exclu-cloud transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" /> Back to Blog
          </Link>

          {articles.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20 text-exclu-space"
            >
              <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium mb-2">No articles yet</p>
              <p className="text-sm">Check back soon for content in this category.</p>
            </motion.div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {articles.map((article, i) => (
                <motion.div
                  key={article.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: Math.min(i * 0.05, 0.3) }}
                >
                  <Link
                    to={`/blog/${article.slug}`}
                    className="group block h-full rounded-2xl border border-white/5 bg-white/[0.02] backdrop-blur-sm overflow-hidden transition-all duration-300 hover:border-white/10 hover:bg-white/[0.04] hover:shadow-lg hover:shadow-black/10"
                  >
                    <div className="relative h-48 overflow-hidden">
                      {article.cover_image_url ? (
                        <img
                          src={article.cover_image_url}
                          alt={article.title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-lime-500/10 to-purple-500/10 flex items-center justify-center">
                          <BookOpen className="w-10 h-10 text-white/10" />
                        </div>
                      )}
                    </div>
                    <div className="p-5">
                      <h2 className="text-base font-semibold text-exclu-cloud leading-snug mb-2 line-clamp-2 group-hover:text-white transition-colors">
                        {article.title}
                      </h2>
                      {article.excerpt && (
                        <p className="text-sm text-exclu-space leading-relaxed line-clamp-2 mb-3">
                          {article.excerpt}
                        </p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-exclu-steel">
                        {article.published_at && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(article.published_at)}
                          </span>
                        )}
                        {article.reading_time_minutes > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {article.reading_time_minutes} min
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default BlogCategoryPage;

import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import {
  Search, Calendar, Clock, BookOpen, Verified, ArrowRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import Aurora from '@/components/ui/Aurora';
import BounceCards from '@/components/ui/BounceCards';

interface BlogCategory {
  id: string;
  slug: string;
  name: string;
}

interface BlogArticle {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  reading_time_minutes: number;
  tags: string[];
  blog_categories: BlogCategory | null;
}

interface FeaturedCreator {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  niche: string | null;
  user_id: string;
}

/* ─── Article Card ─── */
const ArticleCard = ({ article, index }: { article: BlogArticle; index: number }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      className="group"
    >
      <Link
        to={`/blog/${article.slug}`}
        className="glass-card rounded-3xl h-full flex flex-col overflow-hidden hover-lift hover:border-primary/30 transition-all duration-300 block"
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
            <div className="w-full h-full bg-gradient-to-br from-[#CFFF16]/8 to-[#a3e635]/5 flex items-center justify-center">
              <BookOpen className="w-10 h-10 text-[#CFFF16]/15" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          {article.blog_categories && (
            <span className="absolute top-4 left-4 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-black/40 backdrop-blur-sm text-[#CFFF16] border border-[#CFFF16]/20">
              {article.blog_categories.name}
            </span>
          )}
        </div>
        <div className="p-6 flex flex-col flex-1">
          <h3 className="text-lg font-bold text-exclu-cloud leading-snug mb-2 line-clamp-2 group-hover:text-white transition-colors">
            {article.title}
          </h3>
          {article.excerpt && (
            <p className="text-sm text-exclu-space leading-relaxed line-clamp-2 mb-4 flex-1">{article.excerpt}</p>
          )}
          {article.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {article.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-exclu-steel border border-white/5">{tag}</span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3 text-xs text-exclu-steel mt-auto pt-2 border-t border-white/5">
            {article.published_at && (
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(article.published_at)}</span>
            )}
            {article.reading_time_minutes > 0 && (
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{article.reading_time_minutes} min</span>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
};

/* ─── Creator Card (Dropp-style portrait) ─── */
const CreatorPortraitCard = ({ creator }: { creator: FeaturedCreator }) => (
  <a href={`/${creator.username}`} className="flex-shrink-0 group cursor-pointer">
    <div className="relative w-52 h-72 rounded-3xl overflow-hidden transition-all duration-500 group-hover:scale-[1.03] border border-exclu-arsenic/40 group-hover:border-white/30">
      {creator.avatar_url ? (
        <img src={creator.avatar_url} alt={creator.display_name || creator.username} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-exclu-arsenic/30 flex items-center justify-center">
          <span className="text-4xl font-bold text-white/20">{(creator.display_name || creator.username)[0]?.toUpperCase()}</span>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-exclu-black via-exclu-black/90 to-transparent">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-white font-bold text-base truncate">{creator.display_name || creator.username}</p>
          <Verified className="w-4 h-4 text-white flex-shrink-0" />
        </div>
        {creator.niche && <p className="text-exclu-steel text-sm truncate">{creator.niche}</p>}
      </div>
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-white/5 to-transparent" />
      <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </div>
  </a>
);

/* ─── BlogIndex ─── */
const BlogIndex = () => {
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [featuredCreators, setFeaturedCreators] = useState<FeaturedCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const creatorsRef = useRef(null);
  const creatorsInView = useInView(creatorsRef, { once: true, margin: '-50px' });
  const articlesRef = useRef(null);
  const articlesInView = useInView(articlesRef, { once: true, margin: '-50px' });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const [articlesRes, categoriesRes, creatorsRes] = await Promise.all([
        supabase
          .from('blog_articles')
          .select('id, slug, title, excerpt, cover_image_url, published_at, reading_time_minutes, tags, blog_categories(id, slug, name)')
          .eq('status', 'published')
          .order('published_at', { ascending: false })
          .limit(50),
        supabase
          .from('blog_categories')
          .select('id, slug, name')
          .order('sort_order', { ascending: true }),
        supabase
          .from('creator_profiles')
          .select('id, username, display_name, avatar_url, bio, niche, user_id, profile_view_count, is_directory_visible')
          .eq('is_active', true)
          .eq('is_directory_visible', true)
          .not('avatar_url', 'is', null)
          .order('profile_view_count', { ascending: false })
          .limit(50),
      ]);

      if (articlesRes.data) setArticles(articlesRes.data as unknown as BlogArticle[]);
      if (categoriesRes.data) setCategories(categoriesRes.data);

      if (creatorsRes.data && creatorsRes.data.length > 0) {
        console.log('🔍 Blog carousel: Found creators:', creatorsRes.data.length);
        
        // Simple: always show creators, prioritize by profile views
        // No dependency on paid links to ensure carousel always appears
        const sortedCreators = [...creatorsRes.data].sort((a, b) => 
          (b.profile_view_count || 0) - (a.profile_view_count || 0)
        );

        // Always show at least 8 creators for a good carousel effect
        const minCreatorsToShow = 8;
        const featured = sortedCreators.slice(0, minCreatorsToShow);
        
        console.log('🔍 Blog carousel: Featured creators:', featured.length);
        console.log('🔍 Blog carousel: First creator:', featured[0]);
        
        setFeaturedCreators(featured);
      } else {
        console.log('🔍 Blog carousel: No creators found', creatorsRes.error);
      }

      setLoading(false);
    };
    fetchData();
  }, []);

  const filtered = articles.filter((a) => {
    if (search) {
      const q = search.toLowerCase();
      if (!a.title.toLowerCase().includes(q) && !a.excerpt?.toLowerCase().includes(q)) return false;
    }
    if (categoryFilter && a.blog_categories?.id !== categoryFilter) return false;
    return true;
  });

  const categoriesWithArticles = categories.filter((cat) =>
    articles.some((a) => a.blog_categories?.id === cat.id)
  );


  return (
    <div className="dark min-h-screen bg-background text-foreground overflow-x-hidden relative">
      {/* Aurora background */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-30">
        <Aurora colorStops={['#CFFF16', '#a3e635', '#CFFF16']} blend={0.5} amplitude={0.7} speed={0.6} />
      </div>
      <div className="fixed inset-0 pointer-events-none z-0 grid-pattern opacity-5" />

      <Navbar variant="blog" />

      {/* ═══ HERO SECTION ═══ */}
      <section className="relative z-10 pt-28 pb-16 overflow-hidden">
        <div className="absolute inset-0 radial-gradient opacity-30" />
        <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-white/5 rounded-full blur-[150px] animate-pulse-glow" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left — text content */}
            <div className="text-center lg:text-left space-y-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="inline-flex items-center gap-2 glass px-4 py-2 rounded-full"
              >
                <span className="w-2 h-2 bg-[#CFFF16] rounded-full animate-pulse" />
                <span className="text-sm text-exclu-cloud font-medium">The Creator Economy Hub</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold leading-[1.05] tracking-tight"
              >
                Insights for{' '}
                <span className="text-[#CFFF16]">creators</span>
                <br className="hidden sm:block" />
                <span className="sm:hidden">{' '}</span>
                who build empires.
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="text-base sm:text-lg text-exclu-space max-w-xl mx-auto lg:mx-0 leading-relaxed"
              >
                Guides, strategies, and industry news to help you monetize your content,
                grow your audience, and{' '}
                <span className="text-exclu-cloud font-semibold">keep 100% of your revenue.</span>
              </motion.p>

              {/* Search + Category filters */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.4 }}
                className="space-y-4 w-full max-w-xl mx-auto lg:mx-0"
              >
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-exclu-steel" />
                  <Input
                    placeholder="Search articles..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-12 py-3 h-12 bg-white/5 border-white/10 rounded-full text-base"
                  />
                </div>
                <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
                  <button
                    onClick={() => setCategoryFilter('')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                      !categoryFilter
                        ? 'bg-[#CFFF16]/10 text-[#CFFF16] border border-[#CFFF16]/20'
                        : 'text-exclu-space hover:text-exclu-cloud hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    All
                  </button>
                  {categoriesWithArticles.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setCategoryFilter(cat.id === categoryFilter ? '' : cat.id)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                        categoryFilter === cat.id
                          ? 'bg-[#CFFF16]/10 text-[#CFFF16] border border-[#CFFF16]/20'
                          : 'text-exclu-space hover:text-exclu-cloud hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </motion.div>
            </div>

            {/* Right — BounceCards with creator photos */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.3 }}
              className="hidden lg:flex items-center justify-center"
            >
              <BounceCards
                className="custom-bounceCards"
                images={[
                  '/creators/6cddefbc-77e4-4508-8bd1-17deeba78c32.JPG',
                  '/creators/875287ad-5627-41be-8501-ad87d7a4534f.JPG',
                  '/creators/IMG_8271 2.JPG',
                  '/creators/IMG_8266.jpg',
                  '/creators/IMG_8267.jpg',
                ]}
                labels={['Zoey Hart', 'Eden Sky', 'Mila Ray', 'Ava Divine', 'Jade Kim']}
                containerWidth={500}
                containerHeight={300}
                animationDelay={0.6}
                animationStagger={0.08}
                easeType="elastic.out(1, 0.5)"
                transformStyles={[
                  'rotate(5deg) translate(-150px)',
                  'rotate(0deg) translate(-70px)',
                  'rotate(-5deg)',
                  'rotate(5deg) translate(70px)',
                  'rotate(-5deg) translate(150px)',
                ]}
                enableHover={true}
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ═══ CREATORS CAROUSEL ═══ */}
      {!search && !categoryFilter && (
        <motion.section 
          ref={creatorsRef} 
          className="relative z-10 py-6 overflow-hidden"
          initial={{ opacity: 1, height: 'auto' }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        >
          <div className="text-center mb-5 px-6">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-exclu-cloud mb-4">
              They sell with <span className="text-[#CFFF16]">Exclu</span>
            </h2>
            <p className="text-lg text-exclu-space max-w-2xl mx-auto">
              Creators who monetize their content on their own terms.
            </p>
          </div>

          {/* Fade edges */}
          <div className="absolute left-0 top-32 bottom-0 w-20 sm:w-40 bg-gradient-to-r from-background to-transparent z-10" />
          <div className="absolute right-0 top-32 bottom-0 w-20 sm:w-40 bg-gradient-to-l from-background to-transparent z-10" />

          <div className="relative">
            {featuredCreators.length > 0 ? (
              <>
                {/* Row 1 — scrolls left */}
                <div className="flex gap-5 mb-5 animate-scroll-left">
                  {[...featuredCreators, ...featuredCreators, ...featuredCreators].map((c, i) => (
                    <CreatorPortraitCard key={`r1-${i}`} creator={c} />
                  ))}
                </div>

                {/* Row 2 — scrolls right */}
                <div className="flex gap-5 animate-scroll-right">
                  {[...featuredCreators, ...featuredCreators, ...featuredCreators].reverse().map((c, i) => (
                    <CreatorPortraitCard key={`r2-${i}`} creator={c} />
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-10 text-exclu-space">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 animate-pulse" />
                <p>Loading creators...</p>
              </div>
            )}
          </div>

          <div className="text-center mt-10">
            <Button variant="ghost" className="text-exclu-space hover:text-exclu-cloud border border-exclu-arsenic/40" asChild>
              <a href="/directory/creators">
                View all creators <ArrowRight className="w-4 h-4 ml-2" />
              </a>
            </Button>
          </div>
        </motion.section>
      )}

      {/* ═══ ARTICLES SECTION ═══ */}
      <section ref={articlesRef} className="relative z-10 py-6 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto relative z-10">
          {loading ? (
            <div className="space-y-16">
              {Array.from({ length: 2 }).map((_, g) => (
                <div key={g}>
                  <div className="h-6 bg-white/10 rounded w-40 mb-8 animate-pulse" />
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="rounded-3xl border border-exclu-arsenic/40 overflow-hidden animate-pulse">
                        <div className="aspect-[4/3] bg-white/5" />
                        <div className="p-6 space-y-3">
                          <div className="h-5 bg-white/10 rounded w-full" />
                          <div className="h-4 bg-white/10 rounded w-2/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20 text-exclu-space">
              <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-medium mb-2">No articles found</p>
              <p className="text-sm">{search || categoryFilter ? 'Try adjusting your filters.' : 'Check back soon for new content!'}</p>
            </motion.div>
          ) : categoryFilter ? (
            <div className="space-y-10">
              {filtered.length > 0 && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filtered.map((article, i) => (
                    <ArticleCard key={article.id} article={article} index={i} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-20">
              {/* All articles grouped by category */}
              {categories
                .map((cat) => ({
                  ...cat,
                  articles: filtered.filter((a) => a.blog_categories?.id === cat.id),
                }))
                .filter((group) => group.articles.length > 0)
                .map((group, groupIdx) => (
                  <motion.div
                    key={group.id}
                    initial={{ opacity: 0, y: 30 }}
                    animate={articlesInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                    transition={{ duration: 0.7, delay: 0.1 + groupIdx * 0.15 }}
                  >
                    <div className="flex items-center justify-between mb-8">
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-exclu-cloud">
                        {group.name}
                      </h2>
                      <Link
                        to={`/blog/category/${group.slug}`}
                        className="text-sm font-medium text-[#CFFF16] hover:underline flex items-center gap-1"
                      >
                        View all <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                      {group.articles.slice(0, 6).map((article, i) => (
                        <ArticleCard key={article.id} article={article} index={i} />
                      ))}
                    </div>
                  </motion.div>
                ))}

              {/* Uncategorized articles */}
              {filtered.filter((a) => !a.blog_categories).length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={articlesInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
                  transition={{ duration: 0.7, delay: 0.3 }}
                >
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-exclu-cloud mb-8">
                    More articles
                  </h2>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filtered
                      .filter((a) => !a.blog_categories)
                      .map((article, i) => (
                        <ArticleCard key={article.id} article={article} index={i} />
                      ))}
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default BlogIndex;

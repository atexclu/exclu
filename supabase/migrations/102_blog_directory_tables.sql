-- ============================================================================
-- Migration 102: Blog & Directory tables (Pôle SEO)
-- ============================================================================
-- Creates tables for:
--   1. blog_categories    — Article categories (Guides, Industry News, Comparisons)
--   2. blog_articles      — Blog articles with SEO fields + Tiptap JSON content
--   3. blog_article_views — Analytics for article view tracking
--   4. agencies           — Agency directory entries
--   5. tool_comparisons   — Tools vs Exclu comparison pages
--
-- Also adds directory-related columns to creator_profiles.
--
-- RLS pattern follows existing conventions:
--   - Public SELECT for published/visible content (anon + authenticated)
--   - Write operations via Edge Functions using service_role_key
--   - Service role has full access for admin operations
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. blog_categories
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS blog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL CHECK (char_length(slug) >= 1 AND char_length(slug) <= 100),
  name text NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
  description text CHECK (char_length(description) <= 500),
  meta_title text CHECK (char_length(meta_title) <= 70),
  meta_description text CHECK (char_length(meta_description) <= 170),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE blog_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view blog categories" ON blog_categories;
CREATE POLICY "Anyone can view blog categories"
  ON blog_categories FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role can manage blog categories" ON blog_categories;
CREATE POLICY "Service role can manage blog categories"
  ON blog_categories FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed default categories
INSERT INTO blog_categories (slug, name, description, sort_order) VALUES
  ('guides',        'Guides',        'Tutorials and how-to guides for content creators',       1),
  ('industry-news', 'Industry News', 'Latest news and trends in the creator economy',          2),
  ('comparisons',   'Comparisons',   'Exclu vs competitors — honest side-by-side breakdowns',  3)
ON CONFLICT (slug) DO NOTHING;

COMMENT ON TABLE blog_categories IS 'Blog article categories. Managed by admins via Edge Functions.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. blog_articles
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS blog_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  slug text UNIQUE NOT NULL CHECK (char_length(slug) >= 1 AND char_length(slug) <= 200),
  title text NOT NULL CHECK (char_length(title) >= 1 AND char_length(title) <= 300),
  excerpt text CHECK (char_length(excerpt) <= 500),
  content jsonb NOT NULL DEFAULT '{}',
  content_html text,
  cover_image_url text,
  cover_image_alt text CHECK (char_length(cover_image_alt) <= 300),

  -- Classification
  category_id uuid REFERENCES blog_categories(id) ON DELETE SET NULL,
  tags text[] DEFAULT '{}',

  -- SEO
  meta_title text CHECK (char_length(meta_title) <= 70),
  meta_description text CHECK (char_length(meta_description) <= 170),
  canonical_url text,
  og_image_url text,
  focus_keyword text CHECK (char_length(focus_keyword) <= 100),

  -- Publication
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'scheduled', 'archived')),
  published_at timestamptz,
  scheduled_at timestamptz,

  -- Author
  author_name text NOT NULL DEFAULT 'Exclu Team' CHECK (char_length(author_name) <= 100),
  author_url text,

  -- Metadata
  reading_time_minutes integer DEFAULT 0,
  view_count integer NOT NULL DEFAULT 0,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_blog_articles_slug ON blog_articles(slug);
CREATE INDEX IF NOT EXISTS idx_blog_articles_status ON blog_articles(status);
CREATE INDEX IF NOT EXISTS idx_blog_articles_category ON blog_articles(category_id);
CREATE INDEX IF NOT EXISTS idx_blog_articles_published_at ON blog_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_articles_published ON blog_articles(status, published_at DESC)
  WHERE status = 'published';

ALTER TABLE blog_articles ENABLE ROW LEVEL SECURITY;

-- Public: anyone can read published articles whose published_at is in the past
DROP POLICY IF EXISTS "Anyone can view published blog articles" ON blog_articles;
CREATE POLICY "Anyone can view published blog articles"
  ON blog_articles FOR SELECT
  USING (status = 'published' AND published_at <= now());

-- Service role: full access (admin CRUD via Edge Functions)
DROP POLICY IF EXISTS "Service role can manage blog articles" ON blog_articles;
CREATE POLICY "Service role can manage blog articles"
  ON blog_articles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE blog_articles IS 'Blog articles with Tiptap JSON content, pre-rendered HTML for SSR, and SEO fields. Managed by admins.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. blog_article_views (analytics)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS blog_article_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES blog_articles(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  referrer text,
  country text,
  device_type text CHECK (device_type IS NULL OR device_type IN ('mobile', 'desktop', 'tablet'))
);

CREATE INDEX IF NOT EXISTS idx_blog_views_article ON blog_article_views(article_id, viewed_at DESC);

ALTER TABLE blog_article_views ENABLE ROW LEVEL SECURITY;

-- Anyone can insert a view (anonymous tracking)
DROP POLICY IF EXISTS "Anyone can insert blog article views" ON blog_article_views;
CREATE POLICY "Anyone can insert blog article views"
  ON blog_article_views FOR INSERT
  WITH CHECK (true);

-- Service role: full access (for admin analytics reads)
DROP POLICY IF EXISTS "Service role can manage blog article views" ON blog_article_views;
CREATE POLICY "Service role can manage blog article views"
  ON blog_article_views FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE blog_article_views IS 'View tracking for blog articles. Inserted anonymously, read by admin for analytics.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. directory_agencies
-- ═══════════════════════════════════════════════════════════════════════════
-- NOTE: The existing `agencies` table (migration 004) is for user-linked
-- agency account management (user_id, max_profiles, max_chatters).
-- This NEW table is for the public SEO directory of agency listings,
-- managed exclusively by admins. They are distinct concerns.

CREATE TABLE IF NOT EXISTS directory_agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL CHECK (char_length(slug) >= 1 AND char_length(slug) <= 200),
  name text NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 200),
  logo_url text,
  description text,
  website_url text,
  contact_email text,

  -- Location
  country text NOT NULL CHECK (char_length(country) >= 1),
  city text,

  -- Services (e.g. 'management', 'marketing', 'content-creation', 'booking')
  services text[] DEFAULT '{}',

  -- Linked creator profiles (UUIDs from creator_profiles.id)
  creator_profile_ids uuid[] DEFAULT '{}',

  -- Optional link to the actual agencies table row (if the agency has an Exclu account)
  agency_id uuid REFERENCES agencies(id) ON DELETE SET NULL,

  -- SEO
  meta_title text CHECK (char_length(meta_title) <= 70),
  meta_description text CHECK (char_length(meta_description) <= 170),

  -- Admin controls
  is_visible boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_directory_agencies_slug ON directory_agencies(slug);
CREATE INDEX IF NOT EXISTS idx_directory_agencies_visible ON directory_agencies(is_visible) WHERE is_visible = true;
CREATE INDEX IF NOT EXISTS idx_directory_agencies_country ON directory_agencies(country);

ALTER TABLE directory_agencies ENABLE ROW LEVEL SECURITY;

-- Public: anyone can read visible directory agencies
DROP POLICY IF EXISTS "Anyone can view visible directory agencies" ON directory_agencies;
CREATE POLICY "Anyone can view visible directory agencies"
  ON directory_agencies FOR SELECT
  USING (is_visible = true);

-- Service role: full access (admin CRUD via Edge Functions)
DROP POLICY IF EXISTS "Service role can manage directory agencies" ON directory_agencies;
CREATE POLICY "Service role can manage directory agencies"
  ON directory_agencies FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE directory_agencies IS 'Public agency directory listings for SEO. Distinct from the agencies table which manages agency user accounts.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. tool_comparisons
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tool_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL CHECK (char_length(slug) >= 1 AND char_length(slug) <= 200),
  title text NOT NULL CHECK (char_length(title) >= 1 AND char_length(title) <= 300),
  tool_name text NOT NULL CHECK (char_length(tool_name) >= 1 AND char_length(tool_name) <= 100),
  tool_logo_url text,
  tool_website text,

  -- Content (Tiptap JSON + pre-rendered HTML for SSR)
  content jsonb NOT NULL DEFAULT '{}',
  content_html text,

  -- Structured comparison data
  -- { "features": [{ "name": "Commission", "exclu": "0%", "competitor": "20%", "winner": "exclu" }] }
  comparison_data jsonb DEFAULT '[]',

  -- SEO
  meta_title text CHECK (char_length(meta_title) <= 70),
  meta_description text CHECK (char_length(meta_description) <= 170),
  focus_keyword text CHECK (char_length(focus_keyword) <= 100),

  -- Admin controls
  is_visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tool_comparisons_slug ON tool_comparisons(slug);
CREATE INDEX IF NOT EXISTS idx_tool_comparisons_visible ON tool_comparisons(is_visible) WHERE is_visible = true;

ALTER TABLE tool_comparisons ENABLE ROW LEVEL SECURITY;

-- Public: anyone can read visible comparisons
DROP POLICY IF EXISTS "Anyone can view visible tool comparisons" ON tool_comparisons;
CREATE POLICY "Anyone can view visible tool comparisons"
  ON tool_comparisons FOR SELECT
  USING (is_visible = true);

-- Service role: full access
DROP POLICY IF EXISTS "Service role can manage tool comparisons" ON tool_comparisons;
CREATE POLICY "Service role can manage tool comparisons"
  ON tool_comparisons FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE tool_comparisons IS 'Tool comparison pages (Exclu vs X). Tiptap content + structured feature comparison data.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Creator profiles — directory columns
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS niche text;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS is_directory_visible boolean NOT NULL DEFAULT true;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Storage bucket for blog images
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'blog-images',
  'blog-images',
  true,
  10485760, -- 10 MB
  ARRAY['image/jpeg','image/png','image/gif','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Public read access
DROP POLICY IF EXISTS "Public read access for blog images" ON storage.objects;
CREATE POLICY "Public read access for blog images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'blog-images');

-- Admin upload via service_role (Edge Functions)
-- Note: service_role bypasses RLS, so no explicit INSERT policy needed.
-- But we add one for authenticated admins who might upload directly:
DROP POLICY IF EXISTS "Admins can upload blog images" ON storage.objects;
CREATE POLICY "Admins can upload blog images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'blog-images'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

-- Admins can delete blog images
DROP POLICY IF EXISTS "Admins can delete blog images" ON storage.objects;
CREATE POLICY "Admins can delete blog images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'blog-images'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
  );

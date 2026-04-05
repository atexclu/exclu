import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  User,
  Link2,
  Image,
  MessageCircle,
  Gift,
  BarChart3,
  Wallet,
  Sparkles,
  Users,
  Eye,
  Loader2,
  Menu,
  X,
  ChevronRight,
  Settings,
  LogOut,
  Sun,
  Moon,
  Camera,
  FileText,
  Share2,
  Palette,
  ExternalLink,
  Gift as GiftIcon,
  Zap,
  Crop,
  Replace,
  Plus,
  MoreVertical,
  Trash2,
  Edit3,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { ThemeToggleSwitch } from '@/components/ThemeToggleSwitch';
import { useProfiles } from '@/contexts/ProfileContext';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { MobilePreview } from '@/components/linkinbio/MobilePreview';

interface FeatureItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  href?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const CreatorDashboard = () => {
  const { activeProfile, profiles } = useProfiles();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeFeature, setActiveFeature] = useState('info');
  const [handle, setHandle] = useState(activeProfile?.username || '');
  const [displayName, setDisplayName] = useState(activeProfile?.display_name || '');
  const [bio, setBio] = useState(activeProfile?.bio || '');
  
  // Demo content items
  const [contentItems] = useState([
    { id: '1', title: 'Exclusive Photo Set 1', type: 'photo', thumbnail: null },
    { id: '2', title: 'Behind the Scenes Video', type: 'video', thumbnail: null },
    { id: '3', title: 'Custom Content Pack', type: 'package', thumbnail: null },
  ]);

  // Profile features sidebar
  const profileFeatures: FeatureItem[] = [
    { id: 'photo', label: 'Photo', icon: Camera },
    { id: 'info', label: 'Info', icon: FileText },
    { id: 'social', label: 'Social', icon: Share2 },
    { id: 'links', label: 'Links', icon: Link2 },
    { id: 'content', label: 'Content', icon: Image },
    { id: 'wishlist', label: 'Wishlist', icon: Gift },
    { id: 'design', label: 'Design', icon: Palette },
  ];

  // Main navigation
  const navGroups: NavGroup[] = [
    {
      label: 'GENERAL',
      items: [
        { id: 'home', label: 'Home', icon: Home, href: '/app' },
        { id: 'profile', label: 'Profile', icon: User },
        { id: 'links', label: 'Links', icon: Link2, href: '/app/links' },
        { id: 'content', label: 'Content', icon: Image, href: '/app/content' },
        { id: 'chat', label: 'Chat', icon: MessageCircle, href: '/app/chat' },
        { id: 'wishlist', label: 'Wishlist', icon: Gift, href: '/app/wishlist' },
      ],
    },
    {
      label: 'MONETIZE',
      items: [
        { id: 'analytics', label: 'Analytics', icon: BarChart3, href: '/app/analytics' },
        { id: 'earnings', label: 'Earnings', icon: Wallet, href: '/app/earnings' },
      ],
    },
    {
      label: 'TOOLS',
      items: [
        { id: 'ai', label: 'AI Assistant', icon: Sparkles },
        { id: 'referrals', label: 'Referrals', icon: Users, href: '/app/referral' },
      ],
    },
  ];

  const handleSignOut = async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    toast.success('Signed out successfully');
    window.location.href = '/';
  };

  const editorData = {
    display_name: displayName,
    handle: handle,
    bio: bio,
    avatar_url: activeProfile?.avatar_url || null,
    theme_color: 'pink',
    aurora_gradient: 'purple_dream',
    social_links: {},
    model_categories: [],
    show_join_banner: true,
    show_certification: true,
    show_deeplinks: true,
    show_available_now: false,
    location: null,
    exclusive_content_text: null,
    exclusive_content_link_id: null,
    exclusive_content_url: null,
    exclusive_content_image_url: null,
    link_order: { social_order: [], content_order: [] },
    chat_enabled: true,
    tips_enabled: false,
    custom_requests_enabled: false,
    min_tip_amount_cents: 500,
    min_custom_request_cents: 2000,
    show_agency_branding: true,
  };

  const renderFeaturePanel = () => {
    switch (activeFeature) {
      case 'photo':
        return (
          <div className="space-y-4">
            <h3 className="font-semibold">Profile Photo</h3>
            <p className="text-sm text-muted-foreground">Upload a profile photo that represents your brand.</p>
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                {activeProfile?.avatar_url ? (
                  <img src={activeProfile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <Button variant="outline">Upload Photo</Button>
            </div>
          </div>
        );

      case 'info':
        return (
          <div className="space-y-4">
            <h3 className="font-semibold">Profile Info</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1.5">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-muted border border-border text-sm"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">Username</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">@</span>
                  <input
                    type="text"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    className="flex-1 h-10 px-3 rounded-xl bg-muted border border-border text-sm"
                    placeholder="username"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">Bio</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full h-24 px-3 py-2 rounded-xl bg-muted border border-border text-sm resize-none"
                  placeholder="Tell fans about yourself..."
                />
              </div>
              <Button className="w-full">Save Changes</Button>
            </div>
          </div>
        );

      case 'social':
        return (
          <div className="space-y-4">
            <h3 className="font-semibold">Social Links</h3>
            <p className="text-sm text-muted-foreground">Add your social media profiles.</p>
            <div className="space-y-3">
              {['Instagram', 'Twitter/X', 'TikTok', 'YouTube', 'Snapchat'].map((platform) => (
                <div key={platform} className="flex items-center gap-3">
                  <span className="text-sm font-medium w-24">{platform}</span>
                  <input
                    type="text"
                    placeholder={`Your ${platform} URL`}
                    className="flex-1 h-10 px-3 rounded-xl bg-muted border border-border text-sm"
                  />
                </div>
              ))}
              <Button className="w-full">Save Social Links</Button>
            </div>
          </div>
        );

      case 'links':
        return (
          <div className="space-y-4">
            <h3 className="font-semibold">Content Links</h3>
            <p className="text-sm text-muted-foreground">Manage your paid links and content.</p>
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Link2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-3">No links yet</p>
              <Button variant="outline" size="sm">Create Link</Button>
            </div>
          </div>
        );

      case 'content':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Content Library</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{contentItems.length} items</p>
              </div>
              <Button size="sm" className="gap-2" onClick={() => window.location.href = '/app/content'}>
                <Plus className="w-4 h-4" />
                Add New
              </Button>
            </div>

            {contentItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <Image className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-3">No content yet</p>
                <Button variant="outline" size="sm" onClick={() => window.location.href = '/app/content'}>Upload Content</Button>
              </div>
            ) : (
              <div className="space-y-3">
                {contentItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border p-4 hover:border-primary/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        {item.type === 'photo' && <Image className="w-6 h-6 text-muted-foreground" />}
                        {item.type === 'video' && <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center"><Play className="w-4 h-4 text-primary" /></div>}
                        {item.type === 'package' && <Gift className="w-6 h-6 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground capitalize">{item.type}</p>
                        <div className="flex items-center gap-1 mt-2">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
                            <Crop className="w-3 h-3" />
                            Crop
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
                            <Replace className="w-3 h-3" />
                            Replace
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
                            <Edit3 className="w-3 h-3" />
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-red-500 hover:text-red-600">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl border border-dashed border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">Drag and drop to reorder • Click to edit</p>
            </div>
          </div>
        );

      case 'wishlist':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Wishlist</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Let fans send you wishlist items</p>
              </div>
              <Button size="sm" className="gap-2" onClick={() => window.location.href = '/app/wishlist'}>
                <Plus className="w-4 h-4" />
                Add Item
              </Button>
            </div>

            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Gift className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-3">No wishlist items yet</p>
              <Button variant="outline" size="sm" onClick={() => window.location.href = '/app/wishlist'}>Manage Wishlist</Button>
            </div>
          </div>
        );

      case 'design':
        return (
          <div className="space-y-4">
            <h3 className="font-semibold">Profile Design</h3>
            <p className="text-sm text-muted-foreground">Customize your profile appearance.</p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-2">Theme Color</label>
                <div className="flex gap-2">
                  {['pink', 'purple', 'blue', 'green', 'orange'].map((color) => (
                    <button
                      key={color}
                      className={`w-8 h-8 rounded-full border-2 ${
                        color === 'pink' ? 'bg-pink-500 border-pink-500' :
                        color === 'purple' ? 'bg-purple-500 border-purple-500' :
                        color === 'blue' ? 'bg-blue-500 border-blue-500' :
                        color === 'green' ? 'bg-green-500 border-green-500' :
                        'bg-orange-500 border-orange-500'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">Background Style</label>
                <div className="grid grid-cols-3 gap-2">
                  {['purple_dream', 'ocean', 'sunset', 'forest', ' aurora', 'custom'].map((style) => (
                    <button
                      key={style}
                      className="h-12 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 border border-border text-xs text-white/80"
                    >
                      {style.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
              <Button className="w-full">Apply Design</Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Left Sidebar - Main Navigation */}
      <aside className="hidden lg:flex flex-col w-56 border-r border-border bg-background flex-shrink-0">
        <div className="p-4 flex-1 overflow-y-auto">
          {/* Logo */}
          <div className="mb-6 px-2">
            <Link to="/" className="block w-20">
              <img src="/Logo 1.svg" alt="Exclu" className="w-full h-auto" />
            </Link>
          </div>

          {/* Nav groups */}
          {navGroups.map((group) => (
            <div key={group.label} className="mb-5">
              <div className="text-[10px] font-semibold text-muted-foreground tracking-wider px-3 mb-2">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.href ? item.href === window.location.pathname : false;
                  return (
                    <Link
                      key={item.id}
                      to={item.href || '#'}
                      className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-primary/10 text-primary border border-primary/30'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent'
                      }`}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom user area */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{displayName || 'Creator'}</div>
              <div className="text-xs text-muted-foreground truncate">@{handle || 'username'}</div>
            </div>
          </div>
          <div className="mt-2 space-y-1">
            <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>
            <button
              onClick={handleSignOut}
              disabled={isLoading}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Second Sidebar - Profile Features */}
      <aside className="hidden md:flex flex-col w-56 border-r border-border bg-background flex-shrink-0">
        <div className="p-4">
          <div className="text-[10px] font-semibold text-muted-foreground tracking-wider px-3 mb-2">
            EDITOR
          </div>
          <nav className="space-y-0.5">
            {profileFeatures.map((feature) => {
              const Icon = feature.icon;
              const isActive = activeFeature === feature.id;
              return (
                <button
                  key={feature.id}
                  onClick={() => setActiveFeature(feature.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-primary/10 text-primary border border-primary/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{feature.label}</span>
                  <ChevronRight className={`w-3 h-3 ml-auto opacity-50 ${isActive ? 'rotate-90' : ''}`} />
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Mobile nav Sheet for main sidebar */}
      <Sheet open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
        <SheetContent side="left" className="p-0 w-72">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <Link to="/" className="block w-20">
              <img src="/Logo 1.svg" alt="Exclu" className="w-full h-auto" />
            </Link>
            <Button variant="ghost" size="icon" onClick={() => setIsMobileNavOpen(false)}>
              <X className="w-5 h-5" />
            </Button>
          </div>
          <div className="p-3 overflow-y-auto h-full pb-20">
            {navGroups.map((group) => (
              <div key={group.label} className="mb-4">
                <div className="text-[10px] font-semibold text-muted-foreground tracking-wider px-3 mb-1">
                  {group.label}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.id}
                        to={item.href || '#'}
                        onClick={() => setIsMobileNavOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Main content - Live Preview */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="h-14 border-b border-border flex items-center justify-between px-4 flex-shrink-0 bg-background">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden rounded-full"
              onClick={() => setIsMobileNavOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <h1 className="font-semibold text-foreground">Editor</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Referral button */}
            <Button
              variant="default"
              size="sm"
              className="rounded-full gap-2 bg-gradient-to-r from-primary to-pink-500 hover:from-primary/90 hover:to-pink-500/90 text-white font-medium"
              onClick={() => window.location.href = '/app/referral'}
            >
              <Zap className="w-4 h-4" />
              <span className="hidden sm:inline">Refer friends & earn</span>
              <span className="sm:hidden">Referrals</span>
            </Button>
            
            <ThemeToggleSwitch />
            
            <Button
              variant="outline"
              size="sm"
              className="rounded-full gap-2"
              onClick={() => window.open(`/${handle}`, '_blank')}
              disabled={!handle}
            >
              <Eye className="w-4 h-4" />
              <span className="hidden sm:inline">View profile</span>
            </Button>
          </div>
        </div>

        {/* Preview area */}
        <div className="flex-1 overflow-y-auto flex items-center justify-center p-6 bg-muted/30">
          <div className="w-full max-w-[280px]">
            <MobilePreview
              data={editorData}
              links={[]}
              isPremium={true}
              publicContent={[]}
              wishlistItems={[]}
              agencyName={null}
              agencyLogoUrl={null}
            />
          </div>
        </div>
      </main>

      {/* Right Panel - Feature Panel */}
      <aside className="hidden lg:flex flex-col w-80 border-l border-border bg-background flex-shrink-0">
        <div className="p-6 flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeFeature}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderFeaturePanel()}
            </motion.div>
          </AnimatePresence>
        </div>
      </aside>
    </div>
  );
};

export default CreatorDashboard;

import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { ThemeProvider } from "@/contexts/ThemeContext";
import AgeVerificationGate from "@/components/AgeVerificationGate";
import { ProfileProvider } from "@/contexts/ProfileContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import HelpCenter from "./pages/HelpCenter";
import HelpGettingStarted from "./pages/HelpGettingStarted";
import HelpPayoutsPricing from "./pages/HelpPayoutsPricing";
import HelpLinksContent from "./pages/HelpLinksContent";
import HelpAccountSafety from "./pages/HelpAccountSafety";
import Auth from "./pages/Auth";
import Contact from "./pages/Contact";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Cookies from "./pages/Cookies";
import DMCA from "./pages/DMCA";
import Unsubscribe from "./pages/Unsubscribe";
import AntiSlaveryPolicy from "./pages/AntiSlaveryPolicy";
import AppDashboard from "./pages/AppDashboard";
import CreatorLinks from "./pages/CreatorLinks";
import CreateLink from "./pages/CreateLink";
import EditLink from "./pages/EditLink";
import LinkDetail from "./pages/LinkDetail";
import ContentLibrary from "./pages/ContentLibrary";
import CreatorPublic from "./pages/CreatorPublic";
import PublicLink from "./pages/PublicLink";
import Profile from "./pages/Profile";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppShell from "@/components/AppShell";
import Onboarding from "./pages/Onboarding";
import AdminRoute from "@/components/AdminRoute";
import AdminUsers from "./pages/AdminUsers";
import AdminUserOverview from "./pages/AdminUserOverview";
import LinkInBioEditor from "./pages/LinkInBioEditor";
import ReferralDashboard from "./pages/ReferralDashboard";
import FanSignup from "./pages/FanSignup";
import AuthCallback from "./pages/AuthCallback";
import CreatorChat from './pages/CreatorChat';
import FanDashboard from './pages/FanDashboard';
import FanProtectedRoute from '@/components/FanProtectedRoute';
import TipSuccess from './pages/TipSuccess';
import CreatorWishlist from './pages/CreatorWishlist';
import GiftSuccess from './pages/GiftSuccess';
import RequestSuccess from './pages/RequestSuccess';
import CreateProfile from './pages/CreateProfile';
import AgencyDashboard from './pages/AgencyDashboard';
import AcceptChatterInvite from './pages/AcceptChatterInvite';
import ChatterDashboard from './pages/ChatterDashboard';
import ChatterContracts from './pages/ChatterContracts';
import ChatterClientSelector from './pages/ChatterClientSelector';
import ChatterAuth from './pages/ChatterAuth';
import AdminPayments from './pages/AdminPayments';
import AdminEmails from "@/pages/AdminEmails";
import AdminEmailTemplates from "@/pages/admin/AdminEmailTemplates";
import AdminEmailTemplateEdit from "@/pages/admin/AdminEmailTemplateEdit";
import AdminEmailCampaigns from "@/pages/admin/AdminEmailCampaigns";
import AdminEmailCampaignEdit from "@/pages/admin/AdminEmailCampaignEdit";
import AdminEmailContacts from "@/pages/admin/AdminEmailContacts";
import AdminEmailLogs from "@/pages/admin/AdminEmailLogs";
import DirectoryHub from './pages/DirectoryHub';
import DirectoryCreators from './pages/DirectoryCreators';
import DirectoryAgencies from './pages/DirectoryAgencies';
import DirectoryTools from './pages/DirectoryTools';
import AgencyDetail from './pages/AgencyDetail';
import AdminBlogEditor from './pages/AdminBlogEditor';
import BlogIndex from './pages/BlogIndex';
import BlogArticle from './pages/BlogArticle';
import BlogCategory from './pages/BlogCategory';
import SSRBridge from './components/SSRBridge';

const queryClient = new QueryClient();

const App = () => {
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    // Handle auth state changes including email confirmation tokens
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        setIsAuthReady(true);
      } else if (event === 'SIGNED_OUT') {
        setIsAuthReady(true);
      }
    });

    // Also check initial session
    supabase.auth.getSession().then(() => {
      setIsAuthReady(true);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <span className="text-sm text-exclu-space">Loading...</span>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AgeVerificationGate>
          <ProfileProvider>
            <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/help-center" element={<HelpCenter />} />
                <Route path="/help-center/getting-started" element={<HelpGettingStarted />} />
                <Route path="/help-center/payouts-pricing" element={<HelpPayoutsPricing />} />
                <Route path="/help-center/links-content" element={<HelpLinksContent />} />
                <Route path="/help-center/account-safety" element={<HelpAccountSafety />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/chatter" element={<ChatterAuth />} />
                <Route
                  path="/onboarding"
                  element={
                    <ProtectedRoute>
                      <Onboarding />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/users"
                  element={
                    <AdminRoute>
                      <AdminUsers />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/users/:id/overview"
                  element={
                    <AdminRoute>
                      <AdminUserOverview />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/payments"
                  element={
                    <AdminRoute>
                      <AdminPayments />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/emails"
                  element={
                    <AdminRoute>
                      <AdminEmails />
                    </AdminRoute>
                  }
                >
                  <Route index element={<Navigate to="templates" replace />} />
                  <Route path="templates" element={<AdminEmailTemplates />} />
                  <Route path="templates/:slug" element={<AdminEmailTemplateEdit />} />
                  <Route path="campaigns" element={<AdminEmailCampaigns />} />
                  <Route path="campaigns/new" element={<AdminEmailCampaignEdit />} />
                  <Route path="campaigns/:id" element={<AdminEmailCampaignEdit />} />
                  <Route path="contacts" element={<AdminEmailContacts />} />
                  <Route path="logs" element={<AdminEmailLogs />} />
                </Route>
                <Route
                  path="/app"
                  element={
                    <ProtectedRoute>
                      <Navigate to="/app/profile" replace />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/app/dashboard"
                  element={
                    <ProtectedRoute>
                      <AppDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/app/links"
                  element={
                    <ProtectedRoute>
                      <CreatorLinks />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/app/links/new"
                  element={
                    <ProtectedRoute>
                      <CreateLink />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/app/content"
                  element={
                    <ProtectedRoute>
                      <ContentLibrary />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/app/links/:id"
                  element={
                    <ProtectedRoute>
                      <LinkDetail />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/app/links/:id/edit"
                  element={
                    <ProtectedRoute>
                      <EditLink />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/app/settings"
                  element={
                    <ProtectedRoute>
                      <Profile />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/app/profile"
                  element={
                    <ProtectedRoute>
                      <LinkInBioEditor />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/app/referral"
                  element={
                    <ProtectedRoute>
                      <ReferralDashboard />
                    </ProtectedRoute>
                  }
                />
                {/* /app/earnings merged into /app/dashboard (Earnings hub) */}
                <Route
                  path="/app/earnings"
                  element={<Navigate to="/app/dashboard" replace />}
                />
                {/* IBAN payout setup is inline in Profile/Settings */}
                <Route
                  path="/app/chat"
                  element={
                    <ProtectedRoute>
                      <CreatorChat />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/app/profiles/new"
                  element={
                    <ProtectedRoute>
                      <CreateProfile />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/app/agency"
                  element={
                    <ProtectedRoute>
                      <AgencyDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route path="/l/:slug" element={<PublicLink />} />
                <Route path="/fan/signup" element={<FanSignup />} />
                <Route path="/accept-chatter-invite" element={<AcceptChatterInvite />} />
                <Route path="/app/chatter/select" element={<ChatterClientSelector />} />
                <Route path="/app/chatter" element={<ChatterDashboard />} />
                <Route path="/app/chatter/contracts" element={<ChatterContracts />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/tip-success" element={<TipSuccess />} />
                <Route path="/gift-success" element={<GiftSuccess />} />
                <Route path="/request-success" element={<RequestSuccess />} />
                <Route
                  path="/app/wishlist"
                  element={
                    <ProtectedRoute>
                      <CreatorWishlist />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/fan"
                  element={
                    <FanProtectedRoute>
                      <FanDashboard />
                    </FanProtectedRoute>
                  }
                />
                {/* Directory SPA routes */}
                <Route path="/directory" element={<DirectoryHub />} />
                <Route path="/directory/creators" element={<DirectoryCreators />} />
                <Route path="/directory/agencies" element={<DirectoryAgencies />} />
                <Route path="/directory/tools" element={<DirectoryTools />} />

                {/* Admin Blog Editor */}
                <Route
                  path="/admin/blog/new"
                  element={
                    <AdminRoute>
                      <AdminBlogEditor />
                    </AdminRoute>
                  }
                />
                <Route
                  path="/admin/blog/:id/edit"
                  element={
                    <AdminRoute>
                      <AdminBlogEditor />
                    </AdminRoute>
                  }
                />

                <Route path="/contact" element={<Contact />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/unsubscribe" element={<Unsubscribe />} />
                <Route path="/cookies" element={<Cookies />} />
                <Route path="/dmca" element={<DMCA />} />
                <Route path="/anti-slavery-policy" element={<AntiSlaveryPolicy />} />

                {/* Blog SPA pages (SSR handled by Vercel on first load for SEO) */}
                <Route path="/blog" element={<BlogIndex />} />
                <Route path="/blog/:slug" element={<BlogArticle />} />
                <Route path="/blog/category/:slug" element={<BlogCategory />} />

                {/* Directory detail pages */}
                <Route path="/directory/agencies/:slug" element={<AgencyDetail />} />
                <Route path="/directory/tools/:slug" element={<SSRBridge />} />

                {/* Creator public profile - must be LAST before catch-all since it's a wildcard */}
                <Route path="/:handle" element={<CreatorPublic />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
            </TooltipProvider>
          </ProfileProvider>
        </AgeVerificationGate>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;

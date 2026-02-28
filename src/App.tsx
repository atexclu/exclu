import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { ThemeProvider } from "@/contexts/ThemeContext";
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
import StripeValidation from "./pages/StripeValidation";
import FanSignup from "./pages/FanSignup";
import AuthCallback from "./pages/AuthCallback";
import CreatorTipsRequests from "./pages/CreatorTipsRequests";
import FanDashboard from './pages/FanDashboard';
import FanProtectedRoute from '@/components/FanProtectedRoute';
import TipSuccess from './pages/TipSuccess';
import CreatorWishlist from './pages/CreatorWishlist';
import GiftSuccess from './pages/GiftSuccess';

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
                path="/app"
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
              <Route
                path="/app/stripe-validation"
                element={
                  <ProtectedRoute>
                    <StripeValidation />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/app/chat"
                element={
                  <ProtectedRoute>
                    <CreatorTipsRequests />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/app/tips-requests"
                element={
                  <ProtectedRoute>
                    <CreatorTipsRequests />
                  </ProtectedRoute>
                }
              />
              <Route path="/l/:slug" element={<PublicLink />} />
              <Route path="/fan/signup" element={<FanSignup />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/tip-success" element={<TipSuccess />} />
              <Route path="/gift-success" element={<GiftSuccess />} />
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
              <Route path="/contact" element={<Contact />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/cookies" element={<Cookies />} />
              {/* Creator public profile - must be LAST before catch-all since it's a wildcard */}
              <Route path="/:handle" element={<CreatorPublic />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;

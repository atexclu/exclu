import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
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
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/cookies" element={<Cookies />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

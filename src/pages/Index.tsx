import CursorGlow from '@/components/CursorGlow';
import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import CreatorsCarousel from '@/components/CreatorsCarousel';
import WhyExcluSection from '@/components/WhyExcluSection';
import HowItWorksSection from '@/components/HowItWorksSection';
import VideoShowcase from '@/components/VideoShowcase';
import LinkInBioSection from '@/components/LinkInBioSection';
import ChatSection from '@/components/ChatSection';
import PricingSection from '@/components/PricingSection';
import SocialProofSection from '@/components/SocialProofSection';
import FAQSection from '@/components/FAQSection';
import FinalCTASection from '@/components/FinalCTASection';
import Footer from '@/components/Footer';

const Index = () => {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden relative">
      {/* Subtle noise texture overlay */}
      <div className="fixed inset-0 pointer-events-none z-0 opacity-[0.02] bg-[url('data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjU2IDI1NiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZmlsdGVyIGlkPSJub2lzZSI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuOCIgbnVtT2N0YXZlcz0iNCIgc3RpdGNoVGlsZXM9InN0aXRjaCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbHRlcj0idXJsKCNub2lzZSkiLz48L3N2Zz4=')]" />
      
      {/* Subtle grid background */}
      <div className="fixed inset-0 pointer-events-none z-0 grid-pattern opacity-5" />
      
      {/* Cursor Glow Effect */}
      <CursorGlow />
      
      {/* Navigation */}
      <Navbar />

      {/* Main Content */}
      <main className="relative z-10">
        <HeroSection />
        <CreatorsCarousel />
        <WhyExcluSection />
        <HowItWorksSection />
        <div id="video-showcase">
          <VideoShowcase />
        </div>
        <LinkInBioSection />
        <ChatSection />
        <PricingSection />
        <SocialProofSection />
        <FAQSection />
        <FinalCTASection />
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Index;

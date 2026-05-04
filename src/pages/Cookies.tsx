import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const Cookies = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 pt-32 pb-16">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-exclu-cloud mb-2">Cookie Policy</h1>
        <p className="text-exclu-space/60 text-sm mb-10">Last updated: April 2, 2026 — Effective immediately</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-exclu-space/90 [&_h2]:text-exclu-cloud [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-10 [&_h2]:mb-4 [&_h3]:text-exclu-cloud [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_strong]:text-exclu-cloud [&_a]:text-[#CFFF16] [&_a]:no-underline hover:[&_a]:underline [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1">

          <p>This Cookie Policy explains how <strong>FRANCEPRODUCT SAS</strong>, operating under the brand <strong>Exclu</strong>, uses cookies and similar technologies on <strong>exclu.at</strong>.</p>

          <h2>1. What Are Cookies?</h2>
          <p>Cookies are small text files stored on your device when you visit a website. They help websites remember your preferences and enable certain functionalities.</p>

          <h2>2. Cookies We Use</h2>
          <p>Exclu uses a minimal set of cookies, strictly limited to what is necessary for the Platform to function:</p>

          <h3>2.1 Essential Cookies (Strictly Necessary)</h3>
          <p>These cookies are required for the Platform to operate. They cannot be disabled.</p>
          <ul>
            <li><strong>Authentication session token:</strong> Stored in your browser's localStorage (not as an HTTP cookie) to keep you logged in. This is a secure JWT token issued by our authentication provider (Supabase Auth). It expires after your session ends or after a set period of inactivity.</li>
            <li><strong>Theme preference:</strong> Stores your light/dark mode selection locally on your device.</li>
          </ul>

          <h3>2.2 Functional Cookies</h3>
          <ul>
            <li><strong>Session state:</strong> Temporary data to maintain your navigation state (e.g., dismissed modals, active tabs).</li>
          </ul>

          <h2>3. Cookies We Do NOT Use</h2>
          <p>Exclu does <strong>not</strong> use:</p>
          <ul>
            <li>Analytics cookies (Google Analytics, Mixpanel, Amplitude, etc.)</li>
            <li>Advertising or marketing cookies</li>
            <li>Social media tracking pixels</li>
            <li>Third-party tracking cookies of any kind</li>
            <li>Cross-site tracking technologies</li>
          </ul>
          <p>We believe in transparency and privacy. Your browsing activity on Exclu is not tracked for advertising or profiling purposes.</p>

          <h2>4. Third-Party Cookies</h2>
          <p>When you make a payment on Exclu, you are redirected to our payment processor (<strong>UG Payments / UnicornGroup</strong>) which may set its own cookies on its payment page. These cookies are governed by UG Payments' own cookie policy and are not under our control.</p>

          <h2>5. Managing Cookies</h2>
          <p>You can manage or delete cookies through your browser settings. However, disabling essential cookies may prevent you from using Exclu (e.g., you will not be able to stay logged in).</p>
          <p>Most modern browsers allow you to:</p>
          <ul>
            <li>View existing cookies</li>
            <li>Delete all or individual cookies</li>
            <li>Block cookies from specific sites</li>
            <li>Block all cookies (this will prevent login)</li>
          </ul>

          <h2>6. Changes to This Policy</h2>
          <p>We may update this Cookie Policy if we introduce new technologies. Changes are effective when posted on this page.</p>

          <h2>7. Contact</h2>
          <p><strong>FRANCEPRODUCT SAS</strong><br />13 Place Jean Jaurès, 59292 Saint-Hilaire-lez-Cambrai, France<br />Email: <a href="mailto:contact@exclu.at">contact@exclu.at</a><br />Telegram: <a href="https://t.me/exclu_alternative" target="_blank" rel="noopener noreferrer">@exclu_alternative</a></p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Cookies;

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 pt-32 pb-16">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-exclu-cloud mb-2">Privacy Policy</h1>
        <p className="text-exclu-space/60 text-sm mb-10">Last updated: April 2, 2026 — Effective immediately</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-exclu-space/90 [&_h2]:text-exclu-cloud [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-10 [&_h2]:mb-4 [&_h3]:text-exclu-cloud [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_strong]:text-exclu-cloud [&_a]:text-[#CFFF16] [&_a]:no-underline hover:[&_a]:underline [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1">

          <p>This Privacy Policy describes how <strong>FRANCEPRODUCT SAS</strong> (SIREN 898 251 384), operating under the brand <strong>Exclu</strong>, collects, uses, shares, and protects your personal data when you use our platform at <strong>exclu.at</strong>.</p>
          <p>We are committed to protecting your privacy and processing your data in accordance with the <strong>General Data Protection Regulation (GDPR)</strong> (EU Regulation 2016/679) and applicable French data protection laws.</p>

          <h2>1. Data Controller</h2>
          <p><strong>FRANCEPRODUCT SAS</strong><br />13 Place Jean Jaurès, 59292 Saint-Hilaire-lez-Cambrai, France<br />SIREN: 898 251 384<br />Email: <a href="mailto:contact@exclu.at">contact@exclu.at</a></p>

          <h2>2. Data We Collect</h2>
          <h3>2.1 Account Data (All Users)</h3>
          <ul>
            <li>Email address</li>
            <li>Password (stored as a secure bcrypt hash — we never access your plain-text password)</li>
            <li>Display name / username</li>
            <li>Avatar / profile photo (optional)</li>
            <li>Account type (Creator or Fan)</li>
            <li>Theme preference (light/dark mode)</li>
          </ul>
          <h3>2.2 Creator-Specific Data</h3>
          <ul>
            <li>Bio, location, social media links</li>
            <li>Country of residence (for payout purposes)</li>
            <li>Bank account details: IBAN, account holder name, BIC/SWIFT (for withdrawal processing)</li>
            <li>Subscription status (Free or Premium)</li>
            <li>Wallet balance and transaction history</li>
            <li>Profile analytics (view counts, sales counts)</li>
            <li>Content metadata (titles, descriptions, pricing)</li>
          </ul>
          <h3>2.3 Fan-Specific Data</h3>
          <ul>
            <li>Purchase and transaction history</li>
            <li>Tips sent (amount, message, anonymity preference)</li>
            <li>Custom request submissions</li>
            <li>Favorite creators list</li>
            <li>Messages exchanged with creators</li>
          </ul>
          <h3>2.4 Payment Data</h3>
          <p>Payment card details are processed directly by our third-party payment processor (<strong>UG Payments / UnicornGroup</strong>) and are <strong>never stored on our servers</strong>. We only receive transaction confirmation data (transaction ID, amount, status).</p>
          <h3>2.5 Technical Data</h3>
          <ul>
            <li>IP address (for security and fraud prevention)</li>
            <li>Browser type and version</li>
            <li>Device information</li>
            <li>Pages visited and actions taken on the Platform</li>
          </ul>

          <h2>3. How We Use Your Data</h2>
          <ul>
            <li><strong>Account management:</strong> To create and maintain your account, authenticate your identity, and provide customer support.</li>
            <li><strong>Platform operation:</strong> To display creator profiles, process purchases, deliver content, and facilitate communication between users.</li>
            <li><strong>Payment processing:</strong> To process payments, calculate commissions, manage creator wallets, and facilitate withdrawals.</li>
            <li><strong>Notifications:</strong> To send transactional emails (purchase confirmations, tip notifications, custom request updates, account verification).</li>
            <li><strong>Security:</strong> To detect and prevent fraud, abuse, and unauthorized access.</li>
            <li><strong>Legal compliance:</strong> To comply with applicable laws, regulations, and legal processes.</li>
          </ul>

          <h2>4. Legal Basis for Processing (GDPR)</h2>
          <ul>
            <li><strong>Contract performance:</strong> Processing necessary to provide the services you requested.</li>
            <li><strong>Legitimate interests:</strong> Processing necessary for fraud prevention, security, and Platform improvement.</li>
            <li><strong>Legal obligation:</strong> Processing required by law (tax reporting, financial regulations).</li>
            <li><strong>Consent:</strong> Where required, we obtain your explicit consent.</li>
          </ul>

          <h2>5. Third-Party Service Providers</h2>
          <h3>5.1 Payment Processing</h3>
          <p><strong>UG Payments (UnicornGroup)</strong> — Processes credit card payments, subscription billing, and payout transfers. Their processing is governed by their own privacy policy.</p>
          <h3>5.2 Infrastructure</h3>
          <p><strong>Supabase</strong> — Database, authentication, and file storage. Data stored on AWS with encryption at rest and in transit.</p>
          <p><strong>Vercel</strong> — Frontend hosting and CDN. Processes minimal data (request logs, IP addresses).</p>
          <h3>5.3 Email</h3>
          <p><strong>Brevo</strong> — Transactional email delivery. GDPR-compliant, processes data within the EU.</p>
          <h3>5.4 No Analytics or Advertising</h3>
          <p>We do <strong>not</strong> use third-party analytics, advertising networks, or tracking pixels. We do not sell your data.</p>

          <h2>6. Data Retention</h2>
          <ul>
            <li><strong>Active accounts:</strong> Data retained while your account is active.</li>
            <li><strong>Deleted accounts:</strong> All personal data, content, and transaction history deleted upon request.</li>
            <li><strong>Financial records:</strong> Retained up to 10 years for French tax and accounting compliance.</li>
          </ul>

          <h2>7. Your Rights (GDPR)</h2>
          <p>You have the right to: <strong>access</strong>, <strong>rectify</strong>, <strong>erase</strong>, <strong>restrict processing</strong>, <strong>data portability</strong>, <strong>object</strong>, and <strong>withdraw consent</strong>. Contact us at <a href="mailto:contact@exclu.at">contact@exclu.at</a>. We respond within 30 days.</p>

          <h2>8. Data Security</h2>
          <ul>
            <li>SSL/TLS encryption for all data in transit</li>
            <li>Encryption at rest for stored data</li>
            <li>Secure password hashing (bcrypt)</li>
            <li>Row-Level Security (RLS) on all database tables</li>
            <li>Access controls and authentication on all API endpoints</li>
          </ul>

          <h2>9. International Data Transfers</h2>
          <p>Data may be processed outside the EEA (United States). Transfers are protected by Standard Contractual Clauses (SCCs).</p>

          <h2>10. Children's Privacy</h2>
          <p>Exclu is not intended for individuals under 18. We do not knowingly collect data from minors.</p>

          <h2>11. Changes to This Policy</h2>
          <p>We may update this policy. Changes are effective when posted. Continued use constitutes acceptance.</p>

          <h2>12. Contact and Complaints</h2>
          <p><strong>FRANCEPRODUCT SAS</strong><br />13 Place Jean Jaurès, 59292 Saint-Hilaire-lez-Cambrai, France<br />Email: <a href="mailto:contact@exclu.at">contact@exclu.at</a></p>
          <p>You may also lodge a complaint with the <strong>CNIL</strong> (Commission Nationale de l'Informatique et des Libertés) at <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer">www.cnil.fr</a>.</p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Privacy;

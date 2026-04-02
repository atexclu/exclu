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
          <p>We retain personal data only for as long as necessary for the purposes described in this policy:</p>
          <ul>
            <li><strong>Account data:</strong> Retained for the duration of your active account plus 30 days after deletion request.</li>
            <li><strong>Transaction records:</strong> Retained for up to 10 years to comply with French commercial and tax law (Code de commerce, art. L123-22).</li>
            <li><strong>Communication logs:</strong> Messages between users are deleted when either party's account is deleted.</li>
            <li><strong>Server logs:</strong> Automatically purged after 90 days.</li>
            <li><strong>Payment card data:</strong> Not stored by Exclu — handled entirely by UG Payments.</li>
            <li><strong>Bank details (IBAN):</strong> Retained while the creator account is active. Deleted within 30 days of account deletion, except as required by financial regulations.</li>
          </ul>

          <h2>7. Your Rights Under GDPR</h2>
          <p>As a data subject under the General Data Protection Regulation, you have the following rights:</p>
          <ul>
            <li><strong>Right of access (Art. 15):</strong> You may request a copy of your personal data in a structured, commonly used format.</li>
            <li><strong>Right to rectification (Art. 16):</strong> You may request correction of inaccurate or incomplete data.</li>
            <li><strong>Right to erasure (Art. 17):</strong> You may request deletion of your personal data ("right to be forgotten"), subject to legal retention obligations.</li>
            <li><strong>Right to restriction (Art. 18):</strong> You may request that we limit the processing of your data in certain circumstances.</li>
            <li><strong>Right to data portability (Art. 20):</strong> You may request your data in a machine-readable format for transfer to another service.</li>
            <li><strong>Right to object (Art. 21):</strong> You may object to processing based on our legitimate interests.</li>
            <li><strong>Right to withdraw consent (Art. 7):</strong> Where processing is based on consent, you may withdraw it at any time without affecting the lawfulness of prior processing.</li>
            <li><strong>Right not to be subject to automated decision-making (Art. 22):</strong> We do not make decisions based solely on automated processing that produce legal effects concerning you.</li>
          </ul>
          <p>To exercise any of these rights, contact us at <a href="mailto:contact@exclu.at">contact@exclu.at</a>. We will respond within <strong>30 days</strong>. If the request is complex, we may extend this period by an additional 60 days, with prior notification.</p>

          <h2>8. Data Security</h2>
          <p>We implement appropriate technical and organizational measures pursuant to Article 32 of the GDPR:</p>
          <ul>
            <li>SSL/TLS encryption for all data in transit (HTTPS enforced)</li>
            <li>AES-256 encryption at rest for stored data (provided by AWS/Supabase)</li>
            <li>Secure password hashing using bcrypt with appropriate cost factors</li>
            <li>Row-Level Security (RLS) policies enforced at the database level on all tables</li>
            <li>API authentication and authorization on all endpoints</li>
            <li>Rate limiting to prevent brute-force and denial-of-service attacks</li>
            <li>Regular dependency updates and security patches</li>
          </ul>

          <h2>9. Data Breach Notification</h2>
          <p>In the event of a personal data breach that is likely to result in a risk to your rights and freedoms, we will:</p>
          <ul>
            <li>Notify the <strong>CNIL</strong> within 72 hours of becoming aware of the breach, as required by Article 33 of the GDPR.</li>
            <li>Notify affected users without undue delay if the breach is likely to result in a <strong>high risk</strong> to their rights and freedoms (Article 34 GDPR).</li>
            <li>Document the breach, its effects, and the remedial actions taken.</li>
          </ul>

          <h2>10. Automated Decision-Making and Profiling</h2>
          <p>Exclu does <strong>not</strong> engage in automated decision-making or profiling that produces legal effects concerning you or similarly significantly affects you. Commission calculations and payment processing are deterministic operations based on published rates, not individual profiling.</p>

          <h2>11. International Data Transfers</h2>
          <p>Your data may be processed outside the European Economic Area (EEA), specifically:</p>
          <ul>
            <li><strong>United States:</strong> Supabase (database infrastructure on AWS) and Vercel (frontend hosting).</li>
            <li><strong>Switzerland:</strong> UG Payments (payment processing).</li>
          </ul>
          <p>For transfers to the United States, we rely on <strong>Standard Contractual Clauses (SCCs)</strong> approved by the European Commission (Decision 2021/914). Switzerland benefits from an <strong>adequacy decision</strong> from the European Commission. You may request a copy of the applicable safeguards by contacting us.</p>

          <h2>12. Children's Privacy</h2>
          <p>Exclu is not intended for individuals under the age of 18. We do not knowingly collect personal data from minors. If we become aware that a minor has provided personal data, we will delete it within 48 hours of discovery and terminate the associated account.</p>

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

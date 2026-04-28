import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const Terms = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 pt-32 pb-16">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-exclu-cloud mb-2">Terms of Service</h1>
        <p className="text-exclu-space/60 text-sm mb-10">Last updated: April 27, 2026 — Effective immediately</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-8 text-exclu-space/90 [&_h2]:text-exclu-cloud [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-10 [&_h2]:mb-4 [&_h3]:text-exclu-cloud [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_strong]:text-exclu-cloud [&_a]:text-[#CFFF16] [&_a]:no-underline hover:[&_a]:underline [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1">

          <p>
            FRANCEPRODUCT SAS, a French simplified joint-stock company (SAS) registered under SIREN 898 251 384, with registered offices at 13 Place Jean Jaurès, 59292 Saint-Hilaire-lez-Cambrai, France ("<strong>Company</strong>," "<strong>we</strong>," "<strong>us</strong>," or "<strong>our</strong>"), owns and operates the website accessible at <strong>exclu.at</strong> and all affiliated services (collectively, "<strong>Exclu</strong>" or the "<strong>Platform</strong>").
          </p>
          <p>
            Exclu is a content monetization platform that enables creators to sell exclusive digital content through paid links, receive tips, fulfill custom content requests, and manage wishlists — while fans can discover, support, and access premium content from their favorite creators. The terms "<strong>you</strong>," "<strong>your</strong>," or "<strong>User</strong>" refer to all end users, whether Creators or Fans.
          </p>
          <p>
            By registering with and using Exclu, you accept and agree to be bound by these Terms of Service ("<strong>Terms</strong>"). If you do not agree to these Terms, you must not access or use Exclu.
          </p>

          <h2>1. Eligibility and Account Registration</h2>
          <h3>1.1 Age Requirement</h3>
          <p>You must be at least eighteen (18) years old and have reached the age of majority in your jurisdiction to create an account on Exclu. By registering, you represent and warrant that you meet this requirement.</p>

          <h3>1.2 Account Types</h3>
          <ul>
            <li><strong>Creator Account:</strong> Allows you to upload and sell digital content, receive tips, fulfill custom requests, and manage a public creator profile. Creators must provide accurate identity information and may be required to provide bank details (IBAN) for payouts.</li>
            <li><strong>Fan Account:</strong> Allows you to discover creators, purchase content, send tips, gift wishlist items, submit custom content requests, and communicate with creators via the messaging system.</li>
            <li><strong>Agency Account:</strong> Allows management of multiple creator profiles under a single account, with centralized revenue tracking, team member management, and consolidated withdrawal of earnings across all managed profiles.</li>
            <li><strong>Chatter Account:</strong> A team member role granted by a Creator or Agency. Chatters are authorized to manage conversations with fans on behalf of a creator, share paid content links in chat, and respond to custom requests. When a sale is attributed to a chatter (via tracked links shared in conversations), the revenue is split between the creator, the chatter, and the platform according to the chatter revenue sharing model described in Section 5. Chatters do not have access to the creator's financial settings, bank details, or withdrawal capabilities. The creator or agency that grants chatter access remains fully responsible for all actions taken by their chatters.</li>
          </ul>

          <h3>1.3 Account Security</h3>
          <p>You are responsible for maintaining the confidentiality of your login credentials and for all activity that occurs under your account. You must immediately notify us at <strong>contact@exclu.at</strong> if you believe your account has been compromised.</p>

          <h3>1.4 Accurate Information</h3>
          <p>You represent and warrant that all information you provide during registration and throughout your use of Exclu is accurate, complete, and current. You agree to update your information promptly if it changes.</p>

          <h2>2. Creator Content and Responsibilities</h2>
          <h3>2.1 Ownership</h3>
          <p>You retain all ownership rights to the content you upload to Exclu ("<strong>Creator Content</strong>"). By uploading content, you grant Exclu a worldwide, non-exclusive, royalty-free license to host, display, distribute, and make available your Creator Content solely for the purpose of operating the Platform and fulfilling our obligations under these Terms.</p>

          <h3>2.2 Content Standards</h3>
          <p>All Creator Content must comply with applicable laws. You must not upload content that:</p>
          <ul>
            <li>Depicts minors in any context, sexual or otherwise</li>
            <li>Contains child sexual abuse material (CSAM)</li>
            <li>Promotes or facilitates prostitution, sex trafficking, or illegal activities</li>
            <li>Infringes on the intellectual property rights of third parties</li>
            <li>Contains malware, viruses, or harmful code</li>
            <li>Is defamatory, harassing, threatening, or incites violence</li>
            <li>Violates any applicable laws or regulations</li>
          </ul>

          <h3>2.3 Consent and Releases</h3>
          <p>If your Creator Content depicts other individuals, you must obtain and maintain written consent from each depicted person confirming their age (18+), identity, and consent to publication on Exclu. You must provide such documentation to us upon request.</p>

          <h3>2.4 Record-Keeping Obligations</h3>
          <p>If you are a Creator who uploads visual content depicting real persons, you are responsible for maintaining records sufficient to confirm the identity and age of all individuals depicted, in compliance with applicable laws (including, where applicable, 18 U.S.C. § 2257 and equivalent EU/French regulations). These records must include government-issued identification confirming each individual is at least eighteen (18) years of age. You must retain these records for the duration of your account and for a minimum of five (5) years after account closure, and produce them upon lawful request by us or any competent authority.</p>

          <h3>2.5 Content Removal</h3>
          <p>We reserve the right to remove any Creator Content that, in our sole discretion, violates these Terms or applicable law, without prior notice and without liability to you.</p>

          <h2>3. Purchases, Payments, and Fees</h2>
          <h3>3.1 Payment Processing</h3>
          <p>All payments on Exclu are processed through our third-party payment processor, <strong>UG Payments</strong> (UnicornGroup). By making a purchase, you authorize us to charge your payment method through UG Payments. Exclu does not store your credit card information.</p>

          <h3>3.2 Transaction Types</h3>
          <ul>
            <li><strong>Paid Links:</strong> One-time purchases that unlock exclusive digital content from a creator.</li>
            <li><strong>Tips:</strong> Voluntary one-time payments sent directly to a creator as a show of support. Minimum: $5 USD. Maximum: $500 USD.</li>
            <li><strong>Gifts (Wishlist):</strong> Purchases of items from a creator's wishlist on their behalf.</li>
            <li><strong>Custom Requests:</strong> Paid content requests submitted to a creator. The payment is pre-authorized and held until the creator accepts or declines. If the creator accepts and delivers the content, the payment is captured. If the creator declines or fails to respond within 6 days, the hold is released and the fan is not charged. Minimum: $20 USD. Maximum: $1,000 USD.</li>
            <li><strong>Premium Subscription (Monthly):</strong> A recurring monthly subscription for creators at $39.99 USD/month that removes the platform commission on sales (0% instead of 15%).</li>
            <li><strong>Premium Subscription (Annual):</strong> A recurring yearly subscription for creators at $239.99 USD/year (equivalent to approximately $20/month — about 50% savings vs. the Monthly plan). Same 0% platform commission benefit and includes unlimited creator profiles.</li>
            <li><strong>Fan Subscriptions to Creators:</strong> Fans may subscribe directly to individual creator profiles at a recurring monthly price set by each creator (between $5 and $100 USD/month). The subscription grants ongoing access to that creator's subscriber-only content feed and automatically renews every 30 days. A 15% platform commission applies to these subscriptions when the creator is on the Free plan; 0% on Premium plans.</li>
          </ul>

          <h3>3.3 Processing Fee</h3>
          <p>A <strong>15% processing fee</strong> is added to all fan-initiated transactions (paid links, tips, gifts, and custom requests). This fee is paid by the fan on top of the base price and covers payment processing costs. Your bank may apply additional processing fees of up to 5.5% on international card transactions, which are deducted from the amount you see on your statement — not from the creator payout.</p>

          <h3>3.4 Platform Commission</h3>
          <ul>
            <li><strong>Free Plan:</strong> Exclu retains a 15% commission on all creator earnings (tips, link sales, gifts, custom requests).</li>
            <li><strong>Premium Plan ($39.99/month):</strong> 0% commission — creators keep 100% of their earnings.</li>
          </ul>

          <h3>3.5 Creator Earnings and Wallet</h3>
          <p>Creator earnings are credited to an internal wallet on Exclu. Creators may request a withdrawal of their earnings to their registered bank account (IBAN) at any time, subject to a minimum withdrawal amount of <strong>$50 USD</strong>. Withdrawals are processed manually and typically completed within 1–5 business days.</p>

          <h3>3.6 Multi-Profile Pricing</h3>
          <p>The Premium <strong>Monthly</strong> subscription includes up to 2 creator profiles. Each additional profile beyond 2 incurs an additional charge of <strong>$10 USD/month</strong>. The Premium <strong>Annual</strong> subscription includes unlimited profiles (up to 50) with no per-profile add-on charge. The full subscription amount (base $39.99/month + extras for Monthly, or $239.99/year for Annual) is billed directly to the creator's registered payment card at each renewal — it is never debited from the creator's wallet.</p>

          <h3>3.7 Subscription Renewals, Cancellations, and Switches</h3>
          <p><strong>Automatic renewal.</strong> Premium creator subscriptions and fan-to-creator subscriptions renew automatically at the end of each billing period (30 days for Monthly and fan subscriptions, 365 days for Annual) using the payment method on file. No action is required from you to stay subscribed.</p>
          <p><strong>Cancellation.</strong> You may cancel a subscription at any time from your account settings. Cancellation stops the next renewal; you retain full access until the end of the current paid period. You can also reactivate a cancelled subscription at any time before the period ends, and renewals will resume.</p>
          <p><strong>Plan switches (creator Premium).</strong> You may switch between Monthly and Annual Premium plans at any time. The new plan is charged immediately; the previous plan's upcoming renewal is cancelled. The unused portion of the previous plan's current period is not refunded — you simply keep both periods' access until the old one naturally ends.</p>
          <p><strong>Failed payments.</strong> If a renewal payment is declined, we automatically retry up to 3 times over approximately 7 days. If all attempts fail, the subscription is suspended, your account reverts to the Free plan (or, for fan subscriptions, loses access to the creator's subscriber-only feed), and you are notified by email so you can update your card and resubscribe.</p>

          <h3>3.8 Refunds</h3>
          <p>Purchases on Exclu are generally <strong>final and non-refundable</strong>. However, we reserve the right to issue refunds in our sole discretion in appropriate cases, such as:</p>
          <ul>
            <li>A custom request that was declined by the creator (the hold is automatically released)</li>
            <li>Duplicate or erroneous charges</li>
            <li>Content that was not delivered as described</li>
          </ul>

          <h3>3.9 Chargebacks</h3>
          <p>If a purchase results in a chargeback, we reserve the right to immediately suspend or terminate your account and debit the corresponding amount from the creator's wallet.</p>

          <h3>3.10 Taxes</h3>
          <p>You are solely responsible for determining and paying any taxes applicable to your transactions on Exclu. Exclu does not provide tax advice and is not responsible for your tax obligations.</p>

          <h2>4. Referral Program</h2>
          <p>Exclu may provide creators with a unique referral link. When a new creator registers using your referral link and subscribes to a Premium plan (Monthly or Annual), you earn a recurring commission of <strong>35% of the subscription price</strong> — approximately $14.00 USD per monthly renewal, or $84.00 USD per annual renewal — for each billing cycle that the referred creator remains subscribed. Additional bonuses may apply (e.g., $100 bonus when a referred creator reaches $1,000 in net revenue within 90 days).</p>

          <h2>5. Chatter Revenue Sharing</h2>
          <p>When a sale is attributed to a chatter (team member managing conversations on behalf of a creator), the revenue is split as follows:</p>
          <ul>
            <li><strong>Creator:</strong> 60% of the base price</li>
            <li><strong>Chatter:</strong> 25% of the base price</li>
            <li><strong>Platform:</strong> 15% of the base price + 15% processing fee</li>
          </ul>
          <p>This split applies regardless of whether the creator is on the Free or Premium plan.</p>

          <h2>6. Prohibited Conduct</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use Exclu for any unlawful purpose</li>
            <li>Impersonate any person or entity</li>
            <li>Harass, abuse, or threaten other users</li>
            <li>Upload, distribute, or share any illegal content</li>
            <li>Attempt to gain unauthorized access to other users' accounts</li>
            <li>Use bots, scrapers, or automated tools to access Exclu</li>
            <li>Circumvent any security features of the Platform</li>
            <li>Redistribute, resell, or pirate Creator Content</li>
            <li>Engage in fraudulent transactions or chargebacks</li>
            <li>Use Exclu to promote or facilitate prostitution, sex trafficking, or other illegal activities</li>
          </ul>

          <h2>7. Account Termination</h2>
          <p>We reserve the right to suspend or terminate your account at any time, with or without notice, if we believe you have violated these Terms or applicable law. Upon termination:</p>
          <ul>
            <li>Your access to Exclu will be revoked</li>
            <li>Any pending earnings may be forfeited if the termination is due to a violation of these Terms</li>
            <li>Your Creator Content may be removed from the Platform</li>
          </ul>
          <p>You may deactivate your account at any time by contacting us at <strong>contact@exclu.at</strong>.</p>

          <h2>8. Intellectual Property</h2>
          <p>All intellectual property rights in the Platform (including but not limited to the design, graphics, text, software, and trademarks) are owned by FRANCEPRODUCT SAS or its licensors. You may not reproduce, modify, distribute, or create derivative works based on the Platform without our express written consent.</p>

          <h2>9. Disclaimer of Warranties</h2>
          <p>Exclu is provided "<strong>as is</strong>" and "<strong>as available</strong>" without warranties of any kind, whether express or implied. We do not warrant that the Platform will be uninterrupted, error-free, or secure. We disclaim all warranties, including but not limited to merchantability, fitness for a particular purpose, and non-infringement.</p>

          <h2>10. Limitation of Liability</h2>
          <p>To the maximum extent permitted by law, FRANCEPRODUCT SAS and its officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of Exclu, including but not limited to loss of profits, data, or goodwill.</p>

          <h2>11. Indemnification</h2>
          <p>You agree to indemnify, defend, and hold harmless FRANCEPRODUCT SAS and its officers, directors, employees, and agents from any claims, damages, losses, liabilities, and expenses (including reasonable attorneys' fees) arising out of or related to your use of Exclu, your violation of these Terms, or your violation of any rights of a third party.</p>

          <h2>12. Relationship Between Users</h2>
          <p>All transactions for Creator Content — including paid links, tips, gifts, and custom requests — are between the Fan and the Creator. Exclu acts solely as a facilitator and intermediary. At no point does Exclu become a party to any transaction between Users. You agree that any disputes between Users in connection with Creator Content are solely between those Users. Exclu makes no representations or warranties regarding Creator Content quality, accuracy, or legality.</p>

          <h2>13. License to Use the Platform</h2>
          <p>Subject to these Terms, we grant you a conditional, revocable, non-transferable, non-sublicensable, non-exclusive, limited license to access and use Exclu for your own lawful and personal use. This license may be revoked at any time for any reason, including violation of these Terms. All rights not expressly granted are reserved by FRANCEPRODUCT SAS.</p>

          <h2>14. Electronic Communications</h2>
          <p>By creating an account on Exclu or by completing a paid transaction on the Platform (including paid links, tips, gifts, and custom requests), you consent to receive electronic communications from us, including:</p>
          <ul>
            <li><strong>Transactional emails</strong> — purchase confirmations, tip notifications, custom request updates, account verification, payout notifications, and security alerts. These are necessary for the operation of your account and for our contractual obligations under Section 3. You may not opt out of transactional communications while maintaining an active account.</li>
            <li><strong>Service announcements</strong> — material changes to these Terms, the Privacy Policy, or the Platform itself.</li>
            <li><strong>Marketing communications</strong> — product updates, new features, creator tips, promotional offers, and the Exclu newsletter. You may opt out of marketing communications at any time via (a) the "Communications" toggle in your account Settings or (b) the unsubscribe link included in every marketing email. Opting out of marketing does not affect transactional or service communications.</li>
          </ul>
          <p>This consent to marketing is given pursuant to Article 13(2) of the ePrivacy Directive (2002/58/EC as amended), which permits soft opt-in for customers and registered users of the Platform, subject to a clear and free opt-out right.</p>

          <h2>15. Inactive Accounts</h2>
          <p>If you do not log into your Exclu account for twelve (12) consecutive months, your account may be considered inactive. We reserve the right to deactivate inactive accounts after providing reasonable notice to the email address on file. Any remaining wallet balance will be available for withdrawal for 90 days following deactivation notice.</p>

          <h2>16. Force Majeure</h2>
          <p>FRANCEPRODUCT SAS shall not be liable for any failure or delay in performing its obligations under these Terms due to circumstances beyond its reasonable control, including but not limited to natural disasters, war, terrorism, pandemics, government actions, power failures, internet disruptions, or failures of third-party service providers (including payment processors).</p>

          <h2>17. Governing Law and Dispute Resolution</h2>
          <p>These Terms are governed by and construed in accordance with the laws of <strong>France</strong>, without regard to conflict of law principles. In the event of a dispute arising out of or relating to these Terms:</p>
          <ol>
            <li><strong>Amicable resolution:</strong> The parties shall first attempt to resolve the dispute amicably through direct negotiation for a period of thirty (30) days.</li>
            <li><strong>Mediation:</strong> If amicable resolution fails, either party may submit the dispute to mediation in accordance with the mediation rules of the Centre de Médiation et d'Arbitrage de Paris (CMAP).</li>
            <li><strong>Jurisdiction:</strong> If mediation fails, the dispute shall be submitted to the exclusive jurisdiction of the competent courts of Cambrai, France.</li>
          </ol>
          <p><strong>EU consumers:</strong> If you are a consumer residing in the European Union, you may also use the European Commission's Online Dispute Resolution platform at <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">https://ec.europa.eu/consumers/odr</a>.</p>

          <h2>18. Severability</h2>
          <p>If any provision of these Terms is held to be invalid, illegal, or unenforceable by a court of competent jurisdiction, the remaining provisions shall remain in full force and effect. The invalid provision shall be modified to the minimum extent necessary to make it valid and enforceable while preserving its original intent.</p>

          <h2>19. Assignment</h2>
          <p>You may not assign, transfer, or delegate your rights or obligations under these Terms without our prior written consent. FRANCEPRODUCT SAS may freely assign its rights and obligations under these Terms in connection with a merger, acquisition, sale of assets, or by operation of law, without restriction and without notice to you.</p>

          <h2>20. No Waiver</h2>
          <p>The failure of FRANCEPRODUCT SAS to enforce any right or provision of these Terms shall not constitute a waiver of such right or provision. Any waiver must be in writing and signed by an authorized representative of the Company.</p>

          <h2>21. Entire Agreement</h2>
          <p>These Terms, together with the <a href="/privacy">Privacy Policy</a>, <a href="/cookies">Cookie Policy</a>, and <a href="/dmca">DMCA Policy</a>, constitute the entire agreement between you and FRANCEPRODUCT SAS regarding your use of Exclu, superseding any prior agreements or understandings.</p>

          <h2>22. Changes to These Terms</h2>
          <p>We may modify these Terms at any time. Material changes will be communicated via email to registered users at least fifteen (15) days before they take effect. Non-material changes become effective immediately upon posting. Your continued use of Exclu after changes take effect constitutes your acceptance of the revised Terms. If you do not agree to the revised Terms, your sole remedy is to stop using Exclu and request account deletion.</p>

          <h2>23. Account Deletion</h2>
          <p>You may delete your account at any time from your account Settings. Account deletion is <strong>immediate and irreversible</strong>.</p>

          <h3>Pre-deletion requirements (Creators)</h3>
          <ul>
            <li>All pending custom requests must be resolved (accepted, declined, or expired).</li>
            <li>All in-flight payouts must complete.</li>
          </ul>

          <h3>Wallet balance</h3>
          <p>If you delete your account while your wallet contains funds, those funds are <strong>permanently forfeited</strong>. To withdraw your balance, request a payout before initiating account deletion.</p>

          <h3>Active fan subscriptions (Creators)</h3>
          <p>When you delete your account, all active fan subscriptions are canceled. Subscribers retain access until the end of their current billing period and are not charged again. They are notified by email.</p>

          <h3>Active subscriptions (Fans)</h3>
          <p>When you delete your account, all your active subscriptions to creators are canceled. You retain access until the end of each current billing period and are not charged again. No refunds are issued.</p>

          <h3>Creator Pro subscription</h3>
          <p>Pro subscriptions are canceled upon deletion with no prorated refund.</p>

          <h3>Affiliate / referral commissions</h3>
          <p>Future commissions stop accruing immediately upon account deletion. Commissions already credited to your wallet remain in the wallet (and are subject to the same forfeiture rule above if not withdrawn).</p>

          <h3>Handle reservation</h3>
          <p>Your handle (<code>@yourname</code>) is permanently reserved upon deletion and cannot be reused by you or any other user.</p>

          <h3>Re-registration</h3>
          <p>Once an account is deleted, the email address associated with it cannot be used to create a new Exclu account.</p>

          <h3>Data retention</h3>
          <p>In compliance with French accounting law (Code de commerce, Article L. 123-22), transactional data (sales, payouts, tips, custom requests, invoices) is retained for ten (10) years following account deletion. Personal data (display name, biography, avatar, photos, conversations) is hidden from all Exclu surfaces immediately upon deletion. Data is not transmitted to third parties. To exercise your right to deletion of personal data beyond legal retention requirements (RGPD Article 17), contact <a href="mailto:privacy@exclu.at">privacy@exclu.at</a>.</p>

          <h3>Administrative deletion</h3>
          <p>Exclu reserves the right to delete accounts that violate these Terms. Administrative deletion follows the same data retention rules.</p>

          <h2>24. Contact</h2>
          <p>For questions or concerns regarding these Terms, please contact us at:</p>
          <p>
            <strong>FRANCEPRODUCT SAS</strong><br />
            13 Place Jean Jaurès, 59292 Saint-Hilaire-lez-Cambrai, France<br />
            SIREN: 898 251 384<br />
            Email: <a href="mailto:contact@exclu.at">contact@exclu.at</a><br />
            Phone: <a href="tel:+33745017758">+33 7 45 01 77 58</a>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Terms;

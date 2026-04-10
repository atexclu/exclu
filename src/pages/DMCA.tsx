import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const DMCA = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 pt-32 pb-16">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-exclu-cloud mb-2">DMCA Policy</h1>
        <p className="text-exclu-space/60 text-sm mb-10">Last updated: April 2, 2026 — Effective immediately</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-exclu-space/90 [&_h2]:text-exclu-cloud [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-10 [&_h2]:mb-4 [&_h3]:text-exclu-cloud [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_strong]:text-exclu-cloud [&_a]:text-[#CFFF16] [&_a]:no-underline hover:[&_a]:underline [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1">

          <p><strong>FRANCEPRODUCT SAS</strong>, operating under the brand <strong>Exclu</strong>, respects the intellectual property rights of others and expects our users to do the same. We comply with the Digital Millennium Copyright Act (DMCA) and similar international copyright laws.</p>

          <h2>1. Reporting Copyright Infringement</h2>
          <p>If you believe that content on Exclu infringes your copyright, you may submit a DMCA takedown notice to our designated agent. Your notice must include:</p>
          <ol>
            <li><strong>Identification of the copyrighted work</strong> that you claim has been infringed, or a representative list if multiple works are involved.</li>
            <li><strong>Identification of the infringing material</strong> on Exclu that you request to be removed, with sufficient detail to allow us to locate the material (e.g., URL or creator profile link).</li>
            <li><strong>Your contact information,</strong> including your full legal name, mailing address, telephone number, and email address.</li>
            <li><strong>A statement</strong> that you have a good faith belief that the use of the material in the manner complained of is not authorized by the copyright owner, its agent, or the law.</li>
            <li><strong>A statement,</strong> under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner or authorized to act on behalf of the copyright owner.</li>
            <li><strong>Your physical or electronic signature</strong> (or the signature of a person authorized to act on your behalf).</li>
          </ol>

          <h2>2. Where to Send Notices</h2>
          <p>DMCA takedown notices should be sent to our designated agent:</p>
          <p>
            <strong>DMCA Agent — FRANCEPRODUCT SAS</strong><br />
            13 Place Jean Jaurès, 59292 Saint-Hilaire-lez-Cambrai, France<br />
            Email: <a href="mailto:contact@exclu.at">contact@exclu.at</a><br />
            Phone: <a href="tel:+33745017758">+33 7 45 01 77 58</a>
          </p>
          <p>For fastest processing, please submit your notice via email with the subject line "<strong>DMCA Takedown Notice</strong>."</p>

          <h2>3. Processing of Notices</h2>
          <p>Upon receipt of a valid DMCA takedown notice, we will:</p>
          <ol>
            <li>Promptly remove or disable access to the allegedly infringing material.</li>
            <li>Notify the user who posted the content ("alleged infringer") that the material has been removed and provide them with a copy of the takedown notice.</li>
            <li>Inform the alleged infringer of their right to file a counter-notification.</li>
          </ol>

          <h2>4. Counter-Notification</h2>
          <p>If you believe that material removed from Exclu was removed in error or is not infringing, you may submit a counter-notification. Your counter-notification must include:</p>
          <ol>
            <li><strong>Identification of the material</strong> that was removed and the location at which it appeared before it was removed.</li>
            <li><strong>A statement,</strong> under penalty of perjury, that you have a good faith belief that the material was removed or disabled as a result of mistake or misidentification.</li>
            <li><strong>Your full legal name, address, and telephone number,</strong> and a statement that you consent to the jurisdiction of the courts in your district (or, if outside the United States, the jurisdiction of the courts in Saint-Hilaire-lez-Cambrai, France).</li>
            <li><strong>Your physical or electronic signature.</strong></li>
          </ol>
          <p>Counter-notifications should be sent to <a href="mailto:contact@exclu.at">contact@exclu.at</a>.</p>

          <h2>5. Restoration of Content</h2>
          <p>If we receive a valid counter-notification, we will forward it to the original complainant and inform them that the removed content may be restored in <strong>10–14 business days</strong> unless the complainant files a court action seeking to restrain the alleged infringer from engaging in infringing activity relating to the content on Exclu.</p>

          <h2>6. Repeat Infringers</h2>
          <p>In accordance with the DMCA and our Terms of Service, Exclu will <strong>terminate the accounts of users who are repeat infringers</strong>. We define a repeat infringer as any user against whom we have received more than two (2) valid DMCA takedown notices for distinct works.</p>

          <h2>7. Misrepresentation</h2>
          <p>Under Section 512(f) of the DMCA, any person who knowingly materially misrepresents that material is infringing, or that material was removed or disabled by mistake or misidentification, may be subject to liability for damages, including costs and attorneys' fees. Please ensure that your DMCA notice or counter-notification is accurate before submitting.</p>

          <h2>8. Non-Copyright Complaints</h2>
          <p>If your concern is not related to copyright infringement (e.g., trademark violation, privacy concerns, or other legal matters), please contact us at <a href="mailto:contact@exclu.at">contact@exclu.at</a>.</p>

          <h2>9. Contact</h2>
          <p>
            <strong>FRANCEPRODUCT SAS</strong><br />
            DMCA Agent<br />
            13 Place Jean Jaurès, 59292 Saint-Hilaire-lez-Cambrai, France<br />
            Email: <a href="mailto:contact@exclu.at">contact@exclu.at</a><br />
            Phone: <a href="tel:+33745017758">+33 7 45 01 77 58</a>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default DMCA;

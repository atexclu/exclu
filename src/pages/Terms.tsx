import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const Terms = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 pt-32 pb-16">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-exclu-cloud mb-4">Terms of Service</h1>
        <p className="text-exclu-space mb-8">
          This page will contain the full terms of service for Exclu.
        </p>
      </main>
      <Footer />
    </div>
  );
};

export default Terms;

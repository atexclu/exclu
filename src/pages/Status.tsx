import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const Status = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 pt-32 pb-16">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-exclu-cloud mb-4">Status</h1>
        <p className="text-exclu-space mb-8">
          Check the current status of Exclu services. This page will display uptime and incident history.
        </p>
      </main>
      <Footer />
    </div>
  );
};

export default Status;

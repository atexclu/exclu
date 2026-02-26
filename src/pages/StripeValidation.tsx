import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Loader2, ArrowRight, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import CreatorsCarousel from '@/components/CreatorsCarousel';
import logoWhite from '@/assets/logo-white.svg';
import { motion } from 'framer-motion';
const MAX_POLLS = 10;
const POLL_INTERVAL_MS = 3000;

export default function StripeValidation() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [error, setError] = useState<string | null>(null);
    const [isDone, setIsDone] = useState(false);

    useEffect(() => {
        let polls = 0;
        let isActive = true;

        // We may carry mode=refresh or mode=return (though we use mode=return implicitly here)
        const mode = searchParams.get('stripe_onboarding');

        if (mode === 'refresh') {
            setError('Connection was not completed. Please try again.');
            setIsDone(true);
            return;
        }

        const checkStatus = async () => {
            try {
                const { data, error: funcError } = await supabase.functions.invoke('stripe-connect-status', {});

                if (!isActive) return;

                if (funcError) throw funcError;

                if (data && data.status) {
                    if (data.status === 'complete') {
                        toast.success('Stripe connected successfully!');
                        navigate('/app/links');
                        return;
                    } else if (data.status === 'restricted') {
                        setError('Stripe connected but requires more information. Please review your Stripe dashboard.');
                        setIsDone(true);
                        return;
                    } else {
                        // Still pending...
                        polls++;
                        if (polls >= MAX_POLLS) {
                            setError('Validation is taking longer than expected. Please check your profile later to see if it updated.');
                            setIsDone(true);
                        } else {
                            setTimeout(checkStatus, POLL_INTERVAL_MS);
                        }
                    }
                } else {
                    polls++;
                    if (polls >= MAX_POLLS) {
                        setError('Validation is taking longer than expected. Please check your profile later to see if it updated.');
                        setIsDone(true);
                    } else {
                        setTimeout(checkStatus, POLL_INTERVAL_MS);
                    }
                }
            } catch (err) {
                console.error('Error polling Stripe status:', err);
                polls++;
                if (polls >= MAX_POLLS) {
                    setError('An error occurred while verifying the connection.');
                    setIsDone(true);
                } else {
                    setTimeout(checkStatus, POLL_INTERVAL_MS);
                }
            }
        };

        checkStatus();

        return () => {
            isActive = false;
        };
    }, [navigate, searchParams]);

    return (
        <div className="min-h-screen bg-exclu-ink text-white flex flex-col items-center">
            {/* Topbar */}
            <div className="w-full h-16 border-b border-exclu-arsenic/60 flex items-center justify-center bg-black/40 backdrop-blur-md">
                <img src={logoWhite} alt="Exclu" className="h-6 w-auto" />
            </div>

            <div className="flex-1 flex flex-col items-center justify-center w-full px-4 text-center max-w-2xl mx-auto py-12">
                {!isDone ? (
                    <>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.5 }}
                            className="bg-primary/20 p-4 rounded-full mb-6 relative overflow-hidden"
                        >
                            {/* Pulsing effect */}
                            <div className="absolute inset-0 border-[3px] border-primary rounded-full animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" />
                            <Loader2 className="w-12 h-12 text-primary animate-spin" />
                        </motion.div>
                        <h1 className="text-3xl font-extrabold text-exclu-cloud mb-3 tracking-tight">Securing your payout account...</h1>
                        <p className="text-exclu-space/80 text-lg mb-8 max-w-md mx-auto">
                            Please wait while we verify your Stripe details. This usually takes a few seconds. Do not close this page.
                        </p>
                    </>
                ) : (
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.3 }}
                        className="flex flex-col items-center"
                    >
                        <div className="bg-red-500/20 p-4 rounded-full mb-6">
                            <AlertCircle className="w-12 h-12 text-red-500" />
                        </div>
                        <h1 className="text-3xl font-extrabold text-exclu-cloud mb-3 tracking-tight">Validation delayed</h1>
                        <p className="text-exclu-space/80 text-lg mb-8 max-w-lg mx-auto leading-relaxed">
                            {error}
                        </p>
                        <Button
                            size="lg"
                            variant="hero"
                            className="rounded-full px-8 gap-2"
                            onClick={() => navigate('/app/settings')}
                        >
                            Return to profile
                            <ArrowRight className="w-5 h-5" />
                        </Button>
                    </motion.div>
                )}

                <div className="w-full mt-16 max-w-4xl opacity-80 pointer-events-none">
                    {/* Reuse the carousel from the landing page */}
                    <div className="mb-4">
                        <p className="text-sm font-semibold text-exclu-space uppercase tracking-widest">
                            Join exclusive creators
                        </p>
                    </div>
                    <CreatorsCarousel />
                </div>
            </div>
        </div>
    );
}

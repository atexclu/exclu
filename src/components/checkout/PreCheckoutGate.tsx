import { useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { CountrySelect } from './CountrySelect';
import { getGeoCountry } from '@/lib/ipGeo';

export interface PreCheckoutGateState {
  email: string;
  country: string | null;
  ageAccepted: boolean;
}

interface Props {
  value: PreCheckoutGateState;
  onChange: (next: PreCheckoutGateState) => void;
  emailLocked?: boolean;
  requireEmail?: boolean;
  countryHiddenIfSignedIn?: boolean;
  signedInCountry?: string | null;
}

export function PreCheckoutGate({ value, onChange, emailLocked, requireEmail, countryHiddenIfSignedIn, signedInCountry }: Props) {
  const [detected, setDetected] = useState<string | null>(null);

  useEffect(() => {
    if (!value.country && !signedInCountry) {
      getGeoCountry().then((c) => { if (c) setDetected(c); });
    }
  }, [value.country, signedInCountry]);

  const shouldShowCountry = !(countryHiddenIfSignedIn && signedInCountry);
  const currentCountry = value.country ?? signedInCountry ?? null;

  return (
    <div className="space-y-3">
      {!emailLocked && (
        <div>
          <label htmlFor="pre-checkout-email" className="text-[11px] uppercase tracking-[0.22em] text-exclu-space/70 block mb-1.5">
            Email {requireEmail ? <span className="text-red-400">*</span> : null}
          </label>
          <Input
            id="pre-checkout-email"
            type="email"
            required={requireEmail}
            value={value.email}
            onChange={(e) => onChange({ ...value, email: e.target.value })}
            placeholder="you@email.com"
          />
        </div>
      )}

      {shouldShowCountry && (
        <div>
          <label htmlFor="pre-checkout-country" className="text-[11px] uppercase tracking-[0.22em] text-exclu-space/70 block mb-1.5">
            Country <span className="text-red-400">*</span>
          </label>
          <CountrySelect
            id="pre-checkout-country"
            value={currentCountry}
            autoDetectedCountry={detected}
            onChange={(code) => onChange({ ...value, country: code })}
            required
            placeholder="Select your country"
          />
          <p className="text-[11px] text-exclu-space/60 mt-1">
            We use this to route your payment through the right network for your bank.
          </p>
        </div>
      )}

      <label className="flex items-start gap-2.5 cursor-pointer group">
        <Checkbox
          checked={value.ageAccepted}
          onCheckedChange={(v) => onChange({ ...value, ageAccepted: v === true })}
        />
        <span className="text-[11px] text-white/60 leading-relaxed group-hover:text-white/80 transition-colors">
          I confirm that I am at least <strong className="text-white">18 years old</strong> and agree to the{' '}
          <a href="/terms" target="_blank" className="text-primary hover:underline">Terms</a> and{' '}
          <a href="/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</a>.
        </span>
      </label>
    </div>
  );
}

/** Convenience — is the gate complete enough to submit the checkout form? */
export function isPreCheckoutReady(state: PreCheckoutGateState, requireEmail = true): boolean {
  if (!state.ageAccepted) return false;
  if (!state.country) return false;
  if (requireEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email)) return false;
  return true;
}

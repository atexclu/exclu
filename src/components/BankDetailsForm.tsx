import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import { Landmark, Loader2, Check } from 'lucide-react';

export type BankAccountType = 'iban' | 'us' | 'au' | 'other';

export interface BankData {
  bank_account_type?: string;
  bank_iban?: string;
  bank_bic?: string;
  bank_holder_name?: string;
  bank_account_number?: string;
  bank_routing_number?: string;
  bank_bsb?: string;
  bank_country?: string;
}

interface BankDetailsFormProps {
  initialData?: BankData | null;
  payoutSetupComplete: boolean;
  onSaved: (data: BankData) => void;
  onCancel?: () => void;
}

const IBAN_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'MC', 'NL', 'NO',
  'PL', 'PT', 'RO', 'SM', 'SK', 'SI', 'ES', 'SE', 'CH', 'GB', 'VA',
]);

export function detectAccountType(countryCode?: string | null): BankAccountType {
  if (!countryCode) return 'iban';
  const code = countryCode.toUpperCase();
  if (code === 'US') return 'us';
  if (code === 'AU') return 'au';
  if (IBAN_COUNTRIES.has(code)) return 'iban';
  return 'other';
}

function formatIbanDisplay(raw: string): string {
  return raw.replace(/\s/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
}

function validateIban(iban: string): string | null {
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  if (cleaned.length < 15) return 'IBAN is too short';
  if (cleaned.length > 34) return 'IBAN is too long';
  if (!/^[A-Z]{2}[0-9]{2}/.test(cleaned)) return 'IBAN must start with 2 letters and 2 digits';
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let remainder = numeric;
  while (remainder.length > 2) {
    const block = remainder.slice(0, 9);
    remainder = (parseInt(block, 10) % 97).toString() + remainder.slice(block.length);
  }
  if (Number(remainder) !== 1) return 'Invalid IBAN — please double-check the number';
  return null;
}

export function maskBankField(value: string | undefined | null, showFirst = 4, showLast = 4): string {
  if (!value) return '••••';
  if (value.length <= showFirst + showLast) return value;
  return `${value.slice(0, showFirst)} ${'••••'} ${value.slice(-showLast)}`;
}

export function getBankDisplayFields(data: BankData | null | undefined): { label: string; value: string }[] {
  if (!data) return [];
  const type = (data.bank_account_type || 'iban') as BankAccountType;
  const fields: { label: string; value: string }[] = [];

  if (type === 'iban') {
    if (data.bank_iban) fields.push({ label: 'IBAN', value: maskBankField(data.bank_iban) });
    if (data.bank_bic) fields.push({ label: 'BIC', value: data.bank_bic });
  } else if (type === 'us') {
    if (data.bank_account_number) fields.push({ label: 'Account', value: maskBankField(data.bank_account_number, 0, 4) });
    if (data.bank_routing_number) fields.push({ label: 'Routing (ABA)', value: data.bank_routing_number });
  } else if (type === 'au') {
    if (data.bank_account_number) fields.push({ label: 'Account', value: maskBankField(data.bank_account_number, 0, 4) });
    if (data.bank_bsb) fields.push({ label: 'BSB', value: data.bank_bsb });
    if (data.bank_bic) fields.push({ label: 'SWIFT', value: data.bank_bic });
  } else {
    if (data.bank_account_number) fields.push({ label: 'Account', value: maskBankField(data.bank_account_number, 0, 4) });
    if (data.bank_bic) fields.push({ label: 'SWIFT/BIC', value: data.bank_bic });
  }

  if (data.bank_holder_name) fields.push({ label: 'Holder', value: data.bank_holder_name });
  return fields;
}

export default function BankDetailsForm({ initialData, payoutSetupComplete, onSaved, onCancel }: BankDetailsFormProps) {
  const existingType = (initialData?.bank_account_type || 'iban') as BankAccountType;
  const [accountType, setAccountType] = useState<BankAccountType>(existingType);
  const [holderName, setHolderName] = useState(initialData?.bank_holder_name || '');
  const [isSaving, setIsSaving] = useState(false);

  // IBAN fields
  const [iban, setIban] = useState(initialData?.bank_iban ? formatIbanDisplay(initialData.bank_iban) : '');
  const [bic, setBic] = useState(initialData?.bank_bic || '');

  // US fields
  const [accountNumber, setAccountNumber] = useState(initialData?.bank_account_number || '');
  const [routingNumber, setRoutingNumber] = useState(initialData?.bank_routing_number || '');

  // AU fields
  const [bsb, setBsb] = useState(initialData?.bank_bsb || '');

  const ibanError = accountType === 'iban' ? validateIban(iban) : null;

  const isFormValid = (): boolean => {
    if (!holderName.trim()) return false;
    switch (accountType) {
      case 'iban':
        return iban.replace(/\s/g, '').length > 0 && !ibanError;
      case 'us':
        return /^\d{4,17}$/.test(accountNumber) && /^\d{9}$/.test(routingNumber);
      case 'au':
        return /^\d{4,10}$/.test(accountNumber) && /^\d{6}$/.test(bsb.replace(/-/g, ''));
      case 'other':
        return accountNumber.trim().length > 0;
      default:
        return false;
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const body: Record<string, string | undefined> = {
        account_type: accountType,
        holder_name: holderName,
      };

      if (accountType === 'iban') {
        body.iban = iban;
        body.bic = bic || undefined;
      } else if (accountType === 'us') {
        body.account_number = accountNumber;
        body.routing_number = routingNumber;
      } else if (accountType === 'au') {
        body.account_number = accountNumber;
        body.bsb = bsb;
        body.bic = bic || undefined;
      } else {
        body.account_number = accountNumber;
        body.bic = bic || undefined;
      }

      const { data, error } = await supabase.functions.invoke('save-bank-details', { body });
      if (error || !(data as any)?.success) {
        throw new Error((data as any)?.error || 'Failed to save bank details');
      }

      toast.success('Bank details saved successfully');
      onSaved({
        bank_account_type: accountType,
        bank_holder_name: holderName,
        bank_iban: accountType === 'iban' ? iban.replace(/\s/g, '').toUpperCase() : undefined,
        bank_bic: bic || undefined,
        bank_account_number: accountType !== 'iban' ? accountNumber : undefined,
        bank_routing_number: accountType === 'us' ? routingNumber : undefined,
        bank_bsb: accountType === 'au' ? bsb.replace(/-/g, '') : undefined,
        bank_country: (data as any)?.country || undefined,
      });
    } catch (err: any) {
      console.error('Error saving bank details:', err);
      toast.error(err?.message || 'Unable to save bank details. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const ACCOUNT_TYPE_OPTIONS: { value: BankAccountType; label: string }[] = [
    { value: 'iban', label: 'IBAN (Europe, UK, etc.)' },
    { value: 'us', label: 'US Bank Account' },
    { value: 'au', label: 'Australian Bank Account' },
    { value: 'other', label: 'International Wire' },
  ];

  return (
    <div className="space-y-3">
      {/* Account type selector */}
      <div>
        <label className="text-xs font-medium text-foreground ml-1 mb-1 block">Account type</label>
        <select
          value={accountType}
          onChange={(e) => setAccountType(e.target.value as BankAccountType)}
          className="h-10 w-full rounded-xl border border-border bg-muted/50 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/60"
        >
          {ACCOUNT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* IBAN fields */}
      {accountType === 'iban' && (
        <>
          <div>
            <label className="text-xs font-medium text-foreground ml-1 mb-1 block">IBAN</label>
            <Input
              value={iban}
              onChange={(e) => {
                const raw = e.target.value.replace(/\s/g, '').toUpperCase();
                if (raw.length <= 34) setIban(formatIbanDisplay(raw));
              }}
              placeholder="FR76 1234 5678 9012 3456 7890 123"
              className={`bg-muted/50 border-border text-foreground font-mono tracking-wide ${iban && ibanError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
            />
            {iban && ibanError && <p className="text-xs text-red-500 mt-1">{ibanError}</p>}
          </div>
          <div>
            <label className="text-xs font-medium text-foreground ml-1 mb-1 block">
              BIC / SWIFT <span className="text-muted-foreground font-normal">(recommended for international transfers)</span>
            </label>
            <Input
              value={bic}
              onChange={(e) => setBic(e.target.value.toUpperCase())}
              placeholder="BNPAFRPP"
              className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
        </>
      )}

      {/* US fields */}
      {accountType === 'us' && (
        <>
          <div>
            <label className="text-xs font-medium text-foreground ml-1 mb-1 block">Account number</label>
            <Input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
              placeholder="1234567890"
              className="bg-muted/50 border-border text-foreground font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground ml-1 mb-1 block">Routing number (ABA)</label>
            <Input
              value={routingNumber}
              onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, '').slice(0, 9))}
              placeholder="021000021"
              maxLength={9}
              className="bg-muted/50 border-border text-foreground font-mono"
            />
            {routingNumber && routingNumber.length !== 9 && (
              <p className="text-xs text-red-500 mt-1">Routing number must be 9 digits</p>
            )}
          </div>
        </>
      )}

      {/* AU fields */}
      {accountType === 'au' && (
        <>
          <div>
            <label className="text-xs font-medium text-foreground ml-1 mb-1 block">Account number</label>
            <Input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
              placeholder="12345678"
              className="bg-muted/50 border-border text-foreground font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground ml-1 mb-1 block">BSB</label>
            <Input
              value={bsb}
              onChange={(e) => setBsb(e.target.value.replace(/[^\d-]/g, '').slice(0, 7))}
              placeholder="062-000"
              maxLength={7}
              className="bg-muted/50 border-border text-foreground font-mono"
            />
            {bsb && bsb.replace(/-/g, '').length !== 6 && (
              <p className="text-xs text-red-500 mt-1">BSB must be 6 digits</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-foreground ml-1 mb-1 block">
              SWIFT/BIC <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              value={bic}
              onChange={(e) => setBic(e.target.value.toUpperCase())}
              placeholder="CTBAAU2S"
              className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
        </>
      )}

      {/* Other / international wire fields */}
      {accountType === 'other' && (
        <>
          <div>
            <label className="text-xs font-medium text-foreground ml-1 mb-1 block">Account number</label>
            <Input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Your bank account number"
              className="bg-muted/50 border-border text-foreground font-mono"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground ml-1 mb-1 block">
              SWIFT/BIC <span className="text-muted-foreground font-normal">(recommended)</span>
            </label>
            <Input
              value={bic}
              onChange={(e) => setBic(e.target.value.toUpperCase())}
              placeholder="BNPAFRPP"
              className="bg-muted/50 border-border text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
        </>
      )}

      {/* Holder name — always shown */}
      <div>
        <label className="text-xs font-medium text-foreground ml-1 mb-1 block">Account holder name</label>
        <Input
          value={holderName}
          onChange={(e) => setHolderName(e.target.value)}
          placeholder="Full legal name"
          className="bg-muted/50 border-border text-foreground"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          onClick={handleSave}
          disabled={!isFormValid() || isSaving}
          className="rounded-xl gap-2"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Landmark className="w-4 h-4" />}
          {isSaving ? 'Saving...' : 'Save bank details'}
        </Button>
        {onCancel && (
          <Button onClick={onCancel} variant="outline" className="rounded-xl">
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

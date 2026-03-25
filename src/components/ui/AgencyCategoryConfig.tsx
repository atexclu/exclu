import { useRef, useState, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';
import {
  AGENCY_PRICING_OPTIONS,
  AGENCY_TARGET_MARKET_OPTIONS,
  AGENCY_SERVICES_OPTIONS,
  AGENCY_PLATFORM_OPTIONS,
  AGENCY_GROWTH_OPTIONS,
  AGENCY_MODEL_TYPES_OPTIONS,
} from '@/lib/categories';

/* ─── Types ─── */

export interface AgencyCategoryData {
  pricing: string;
  targetMarket: string[];
  services: string[];
  platform: string[];
  growthStrategy: string[];
  modelTypes: string[];
}

export const EMPTY_AGENCY_CATEGORIES: AgencyCategoryData = {
  pricing: '',
  targetMarket: [],
  services: [],
  platform: [],
  growthStrategy: [],
  modelTypes: [],
};

/* ─── Single field selector ─── */

interface SelectorProps {
  label: string;
  description: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (values: string[]) => void;
  single?: boolean;
}

const AgencyCategorySelector = ({
  label,
  description,
  options,
  value,
  onChange,
  single = false,
}: SelectorProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (val: string) => {
    if (single) {
      onChange(value.includes(val) ? [] : [val]);
      setOpen(false);
    } else {
      onChange(value.includes(val) ? value.filter((v) => v !== val) : [...value, val]);
    }
  };

  const remove = (val: string) => onChange(value.filter((v) => v !== val));

  const activeCount = value.length;

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-semibold text-exclu-cloud uppercase tracking-wider">{label}</p>
        <p className="text-[11px] text-exclu-space/60 mt-0.5">{description}</p>
      </div>

      {/* Selected tags */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => {
            const opt = options.find((o) => o.value === v);
            return (
              <span
                key={v}
                className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-medium bg-black/5 dark:bg-[#CFFF16]/10 text-foreground dark:text-[#CFFF16] border border-black/15 dark:border-[#CFFF16]/25"
              >
                {opt?.label ?? v}
                <button
                  type="button"
                  onClick={() => remove(v)}
                  className="hover:opacity-60 dark:hover:text-white transition-colors ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Dropdown trigger */}
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`w-full flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all border ${
            activeCount > 0
              ? 'bg-[#CFFF16]/5 border-[#CFFF16]/20 text-exclu-cloud'
              : 'bg-exclu-ink/60 border-exclu-arsenic/50 text-exclu-space hover:border-exclu-arsenic hover:text-exclu-cloud'
          }`}
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          {activeCount === 0
            ? `Select ${label.toLowerCase()}…`
            : `${activeCount} selected`}
        </button>

        {open && (
          <div className="absolute z-50 mt-1.5 left-0 min-w-[220px] rounded-xl border border-exclu-arsenic/50 bg-[#0a0a0f] shadow-2xl shadow-black/60 overflow-hidden">
            <div className="max-h-52 overflow-y-auto overscroll-contain py-1">
              {options.map((opt) => {
                const selected = value.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggle(opt.value)}
                    className={`w-full text-left px-3.5 py-2 text-xs transition-colors flex items-center justify-between gap-3 ${
                      selected
                        ? 'bg-black/5 dark:bg-[#CFFF16]/10 text-foreground dark:text-[#CFFF16]'
                        : 'text-exclu-space hover:bg-exclu-arsenic/20 hover:text-exclu-cloud'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {selected && <Check className="w-3 h-3 flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Full 6-category config ─── */

interface ConfigProps {
  value: AgencyCategoryData;
  onChange: (data: AgencyCategoryData) => void;
}

export const AgencyCategoryConfig = ({ value, onChange }: ConfigProps) => {
  const set = <K extends keyof AgencyCategoryData>(key: K, val: AgencyCategoryData[K]) =>
    onChange({ ...value, [key]: val });

  const pricingArr = value.pricing ? [value.pricing] : [];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <AgencyCategorySelector
        label="Pricing Structure"
        description="Your agency's commission model"
        options={AGENCY_PRICING_OPTIONS}
        value={pricingArr}
        onChange={(arr) => set('pricing', arr[0] ?? '')}
        single
      />
      <AgencyCategorySelector
        label="Target Market"
        description="Types of creators you work with"
        options={AGENCY_TARGET_MARKET_OPTIONS}
        value={value.targetMarket}
        onChange={(arr) => set('targetMarket', arr)}
      />
      <AgencyCategorySelector
        label="Services Offered"
        description="What your agency provides"
        options={AGENCY_SERVICES_OPTIONS}
        value={value.services}
        onChange={(arr) => set('services', arr)}
      />
      <AgencyCategorySelector
        label="Platform Focus"
        description="Platforms your agency operates on"
        options={AGENCY_PLATFORM_OPTIONS}
        value={value.platform}
        onChange={(arr) => set('platform', arr)}
      />
      <AgencyCategorySelector
        label="Growth Strategy"
        description="Main traffic and growth methods"
        options={AGENCY_GROWTH_OPTIONS}
        value={value.growthStrategy}
        onChange={(arr) => set('growthStrategy', arr)}
      />
      <AgencyCategorySelector
        label="Model Types"
        description="Niches and content types you specialize in"
        options={AGENCY_MODEL_TYPES_OPTIONS}
        value={value.modelTypes}
        onChange={(arr) => set('modelTypes', arr)}
      />
    </div>
  );
};

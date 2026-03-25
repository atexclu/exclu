import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { MODEL_CATEGORY_GROUPS, getModelCategoryLabel } from '@/lib/categories';

interface ModelCategoryDropdownProps {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function ModelCategoryDropdown({
  value,
  onChange,
  placeholder = 'Select categories…',
  className,
}: ModelCategoryDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggle = (cat: string) => {
    onChange(value.includes(cat) ? value.filter((c) => c !== cat) : [...value, cat]);
  };

  const remove = (cat: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((c) => c !== cat));
  };

  const filteredGroups = Object.entries(MODEL_CATEGORY_GROUPS)
    .map(([groupName, options]) => ({
      groupName,
      options: search.trim()
        ? options.filter(
            (o) =>
              o.label.toLowerCase().includes(search.toLowerCase()) ||
              groupName.toLowerCase().includes(search.toLowerCase())
          )
        : options,
    }))
    .filter((g) => g.options.length > 0);

  return (
    <div ref={dropdownRef} className={`relative ${className ?? ''}`}>
      {/* Selected tags */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((cat) => (
            <span
              key={cat}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/5 dark:bg-[#CFFF16]/10 text-foreground dark:text-[#CFFF16] text-[11px] font-medium border border-black/15 dark:border-[#CFFF16]/30"
            >
              {getModelCategoryLabel(cat)}
              <button
                type="button"
                onClick={(e) => remove(cat, e)}
                className="ml-0.5 hover:opacity-60 dark:hover:text-white transition-colors"
                aria-label={`Remove ${getModelCategoryLabel(cat)}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(!open); if (!open) setSearch(''); }}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-exclu-arsenic/50 bg-exclu-ink/60 text-xs text-exclu-space hover:border-exclu-space/50 transition-colors"
      >
        <span className="text-exclu-space/60">
          {value.length === 0
            ? placeholder
            : `${value.length} ${value.length === 1 ? 'category' : 'categories'} selected — add more…`}
        </span>
        <ChevronDown className={`w-4 h-4 text-exclu-space/50 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl border border-exclu-arsenic/50 bg-black shadow-xl shadow-black/40 overflow-hidden">
          <div className="p-2 border-b border-exclu-arsenic/40">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search categories…"
              autoFocus
              className="w-full px-3 py-2 rounded-lg border border-exclu-arsenic/50 bg-exclu-ink/80 text-xs text-exclu-cloud placeholder:text-exclu-space/40 focus:outline-none focus:ring-1 focus:ring-[#CFFF16]/40"
            />
          </div>
          <div className="max-h-60 overflow-y-auto overscroll-contain">
            {filteredGroups.length === 0 ? (
              <p className="px-3 py-4 text-xs text-exclu-space/50 text-center">No matching categories</p>
            ) : (
              filteredGroups.map(({ groupName, options }) => (
                <div key={groupName}>
                  <p className="px-3 pt-2.5 pb-1 text-[10px] text-exclu-space/50 uppercase tracking-wider font-semibold">
                    {groupName}
                  </p>
                  {options.map((opt) => {
                    const isSelected = value.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggle(opt.value)}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                          isSelected
                            ? 'bg-black/5 dark:bg-[#CFFF16]/10 text-foreground dark:text-[#CFFF16]'
                            : 'text-exclu-space hover:bg-exclu-arsenic/30 hover:text-exclu-cloud'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {isSelected && <span className="text-[10px]">✓</span>}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PINNED_COUNTRIES, ALL_COUNTRIES, searchCountries, type Country } from '@/lib/countryList';

interface Props {
  value: string | null;
  onChange: (code: string) => void;
  autoDetectedCountry?: string | null;
  placeholder?: string;
  required?: boolean;
  id?: string;
}

export function CountrySelect({ value, onChange, autoDetectedCountry, placeholder = 'Select country…', required, id }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const results = useMemo(() => searchCountries(query), [query]);

  const selectedName = useMemo(() => {
    if (!value) return null;
    return ALL_COUNTRIES.find(c => c.code === value)?.name ?? value;
  }, [value]);

  // Auto-preselect from IP geo on first render
  useEffect(() => {
    if (!value && autoDetectedCountry) {
      onChange(autoDetectedCountry);
    }
  }, [value, autoDetectedCountry, onChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-required={required}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
          )}
        >
          {selectedName || placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Type to search…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No country found.</CommandEmpty>
            {!query && (
              <CommandGroup heading="Common">
                {PINNED_COUNTRIES.map(c => (
                  <CountryRow key={c.code} country={c} selected={value === c.code} onSelect={(code) => { onChange(code); setOpen(false); }} />
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading={query ? 'Results' : 'All'}>
              {results
                .filter(c => query || !PINNED_COUNTRIES.find(p => p.code === c.code))
                .map(c => (
                  <CountryRow key={c.code} country={c} selected={value === c.code} onSelect={(code) => { onChange(code); setOpen(false); }} />
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function CountryRow({ country, selected, onSelect }: { country: Country; selected: boolean; onSelect: (code: string) => void }) {
  return (
    <CommandItem value={country.code} onSelect={() => onSelect(country.code)}>
      <Check className={cn('mr-2 h-4 w-4', selected ? 'opacity-100' : 'opacity-0')} />
      <span className="flex-1">{country.name}</span>
      <span className="text-xs text-muted-foreground">{country.code}</span>
    </CommandItem>
  );
}

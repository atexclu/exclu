/**
 * LinkUrlPlaceholderInput
 *
 * URL input with a multi-platform animated GIF on the left and a placeholder
 * that cycles through the same platforms every ~1s, in sync with the GIF.
 *
 * Sync note: the GIF cycles independently in the browser; we have no JS hook
 * to read its current frame. The interval starts at component mount, same
 * moment the GIF starts playing, so they stay roughly in sync. Drift over
 * time is acceptable given the GIF and the placeholder change at the same
 * 1s cadence (the user explicitly accepted "approximately 1s").
 */

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import iconGif from '@/assets/onboarding/Icon_onboarding.gif';

const PLACEHOLDERS = [
  'Enter your Onlyfan link',
  'Enter your Patreon link',
  'Enter your Fanvue link',
  'Enter your Exclu link',
  'Enter your Telegram link',
  'Enter your Fansly link',
  'Enter your Manyvids link',
  'Enter your MYM link',
];

// The Icon_onboarding.gif file is 332 frames @ 40ms each = 13.28s for one
// full loop covering 8 logos → ~1660ms per logo. Match that exactly so the
// placeholder text stays in step with the visible logo at every cycle.
const CYCLE_MS = 1660;

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
  ariaLabel?: string;
}

export function LinkUrlPlaceholderInput({
  value,
  onChange,
  className = '',
  id,
  ariaLabel,
}: Props) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setIndex((i) => (i + 1) % PLACEHOLDERS.length);
    }, CYCLE_MS);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="relative">
      <img
        src={iconGif}
        alt=""
        aria-hidden
        className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none select-none"
      />
      <Input
        id={id}
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={PLACEHOLDERS[index]}
        aria-label={ariaLabel}
        className={`pl-10 ${className}`}
      />
    </div>
  );
}

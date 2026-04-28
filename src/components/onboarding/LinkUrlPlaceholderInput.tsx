/**
 * LinkUrlPlaceholderInput
 *
 * URL input with the multi-platform animated GIF on the left and a static
 * "Enter your link" placeholder. The cycling-platform placeholder was
 * removed because the gif's frame timing didn't align with a JS interval
 * cleanly; the gif still does the visual cue on its own.
 */

import { Input } from '@/components/ui/input';
import iconGif from '@/assets/onboarding/Icon_onboarding.gif';

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
        placeholder="Enter your link"
        aria-label={ariaLabel}
        className={`pl-10 ${className}`}
      />
    </div>
  );
}

/**
 * RichMessageComposer
 *
 * Zone de saisie de message avec envoi par Enter (Shift+Enter = saut de ligne).
 * Phase 2 : texte simple.
 * Phase 6 : ajout du bouton "Attacher un contenu payant".
 */

import { useRef, KeyboardEvent, ChangeEvent } from 'react';
import { Send, Loader2, ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface RichMessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
  disabled?: boolean;
  placeholder?: string;
  onMediaSelect?: (file: File) => void;
  hasPendingMedia?: boolean;
}

export function RichMessageComposer({
  value,
  onChange,
  onSend,
  isSending,
  disabled = false,
  placeholder = 'Write a message…',
  onMediaSelect,
  hasPendingMedia = false,
}: RichMessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onMediaSelect) {
      onMediaSelect(file);
    }
    if (e.target) e.target.value = '';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter seul = envoyer, Shift+Enter = nouvelle ligne
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if ((value.trim() || hasPendingMedia) && !isSending && !disabled) {
        onSend();
      }
    }
  };

  return (
    <div className="flex items-end gap-2 p-3 border-t border-border bg-card">
      {onMediaSelect && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-xl flex-shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isSending}
            title="Upload photo or video"
          >
            <ImagePlus className="w-4 h-4" />
          </Button>
        </>
      )}
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || isSending}
        rows={1}
        className="flex-1 min-h-[40px] max-h-[120px] resize-none text-sm bg-muted/50 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-xl"
        style={{ height: 'auto' }}
        onInput={(e) => {
          // Auto-resize
          const el = e.currentTarget;
          el.style.height = 'auto';
          el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
        }}
      />
      <Button
        type="button"
        size="icon"
        className="h-10 w-10 rounded-xl flex-shrink-0"
        onClick={onSend}
        disabled={(!value.trim() && !hasPendingMedia) || isSending || disabled}
      >
        {isSending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Send className="w-4 h-4" />
        )}
      </Button>
    </div>
  );
}

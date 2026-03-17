/**
 * FanTagsRow
 *
 * Affiche les tags d'un fan dans le header d'une conversation.
 * Permet d'ajouter/supprimer des tags (créateur et chatters seulement).
 *
 * Props:
 *  - fanId      : UUID du fan
 *  - profileId  : UUID du profil créateur
 */

import { useEffect, useState, useRef } from 'react';
import { Tag, Plus, X, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

const TAG_COLORS = ['gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple', 'pink'];

const COLOR_CLASSES: Record<string, string> = {
  gray:   'bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30',
  blue:   'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30',
  green:  'bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30',
  yellow: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30',
  orange: 'bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30',
  red:    'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30',
  purple: 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30',
  pink:   'bg-pink-500/20 text-pink-700 dark:text-pink-300 border-pink-500/30',
};

const COLOR_DOT: Record<string, string> = {
  gray:   'bg-gray-400',
  blue:   'bg-blue-400',
  green:  'bg-green-400',
  yellow: 'bg-yellow-400',
  orange: 'bg-orange-400',
  red:    'bg-red-400',
  purple: 'bg-purple-400',
  pink:   'bg-pink-400',
};

interface FanTag {
  id: string;
  tag: string;
  color: string;
}

interface FanTagsRowProps {
  fanId: string;
  profileId: string;
  readOnly?: boolean;
}

export function FanTagsRow({ fanId, profileId, readOnly = false }: FanTagsRowProps) {
  const [tags, setTags] = useState<FanTag[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [selectedColor, setSelectedColor] = useState('blue');
  const [isSaving, setIsSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('fan_tags')
        .select('id, tag, color')
        .eq('fan_id', fanId)
        .eq('profile_id', profileId)
        .order('created_at', { ascending: true });
      setTags((data as FanTag[]) ?? []);
    };
    load();
  }, [fanId, profileId]);

  useEffect(() => {
    if (isAdding) inputRef.current?.focus();
  }, [isAdding]);

  const handleAddTag = async () => {
    const trimmed = newTag.trim().toLowerCase();
    if (!trimmed) return;
    if (tags.some((t) => t.tag === trimmed)) {
      toast.error('Ce tag existe déjà');
      return;
    }

    setIsSaving(true);
    const { data, error } = await supabase
      .from('fan_tags')
      .insert({ fan_id: fanId, profile_id: profileId, tag: trimmed, color: selectedColor, created_by: (await supabase.auth.getUser()).data.user?.id })
      .select('id, tag, color')
      .single();

    if (error) {
      toast.error('Impossible d\'ajouter le tag');
    } else if (data) {
      setTags((prev) => [...prev, data as FanTag]);
      setNewTag('');
      setIsAdding(false);
    }
    setIsSaving(false);
  };

  const handleRemoveTag = async (tag: FanTag) => {
    setRemovingId(tag.id);
    const { error } = await supabase.from('fan_tags').delete().eq('id', tag.id);
    if (error) {
      toast.error('Impossible de supprimer le tag');
    } else {
      setTags((prev) => prev.filter((t) => t.id !== tag.id));
    }
    setRemovingId(null);
  };

  if (tags.length === 0 && readOnly) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap min-h-[24px]">
      <Tag className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />

      {tags.map((tag) => (
        <span
          key={tag.id}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${COLOR_CLASSES[tag.color] ?? COLOR_CLASSES.gray}`}
        >
          {tag.tag}
          {!readOnly && (
            <button
              type="button"
              onClick={() => handleRemoveTag(tag)}
              disabled={removingId === tag.id}
              className="ml-0.5 hover:opacity-70 transition-opacity"
            >
              {removingId === tag.id
                ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                : <X className="w-2.5 h-2.5" />
              }
            </button>
          )}
        </span>
      ))}

      {!readOnly && !isAdding && (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Tag
        </button>
      )}

      {isAdding && (
        <div className="flex items-center gap-1.5">
          {/* Color picker */}
          <div className="flex gap-0.5">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setSelectedColor(c)}
                className={`w-3.5 h-3.5 rounded-full ${COLOR_DOT[c]} transition-transform ${selectedColor === c ? 'scale-125 ring-1 ring-white/30' : 'opacity-60'}`}
              />
            ))}
          </div>

          <input
            ref={inputRef}
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value.slice(0, 20))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddTag();
              if (e.key === 'Escape') { setIsAdding(false); setNewTag(''); }
            }}
            placeholder="nom du tag"
            className="h-5 w-24 text-[10px] bg-muted/50 border border-border rounded-full px-2 focus:outline-none focus:ring-1 focus:ring-primary/50"
            maxLength={20}
          />

          <button
            type="button"
            onClick={handleAddTag}
            disabled={!newTag.trim() || isSaving}
            className="text-[10px] text-primary hover:opacity-80 disabled:opacity-40 transition-opacity"
          >
            {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'OK'}
          </button>
          <button
            type="button"
            onClick={() => { setIsAdding(false); setNewTag(''); }}
            className="text-[10px] text-muted-foreground/50 hover:opacity-80 transition-opacity"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

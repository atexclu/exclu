-- ============================================================================
-- Migration 180: per-user soft-delete on conversations
-- ============================================================================
-- Each side (fan / creator+chatter) can hide a conversation from their own
-- inbox. The conversation row stays in DB so the other side keeps their
-- view, and the full message history is preserved for audit/admin support.
-- ============================================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS fan_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS creator_deleted_at timestamptz;

-- Hot-path indexes: list queries filter on the requester's *_deleted_at IS NULL
CREATE INDEX IF NOT EXISTS idx_conversations_fan_active
  ON public.conversations (fan_id) WHERE fan_deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_profile_active
  ON public.conversations (profile_id) WHERE creator_deleted_at IS NULL;

COMMENT ON COLUMN public.conversations.fan_deleted_at IS
  'Set when the fan removes the conversation from their inbox. Conv stays
visible to the creator and is preserved in DB for admin/legal traceability.';

COMMENT ON COLUMN public.conversations.creator_deleted_at IS
  'Set when the creator (or any of their assigned chatters) removes the
conversation from the creator-side inbox. Conv stays visible to the fan
and is preserved for admin/legal traceability. Hides from chatters too —
chatters share the creator-side view and do not independently delete.';

-- ── RPC: stamp the right column based on the caller's role ─────────────────
CREATE OR REPLACE FUNCTION public.delete_conversation_for_self(
  p_conversation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_fan_id uuid;
  v_creator_user_id uuid;
  v_chatter_id uuid;
  v_role text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT c.fan_id, cp.user_id, c.assigned_chatter_id
    INTO v_fan_id, v_creator_user_id, v_chatter_id
    FROM public.conversations c
    JOIN public.creator_profiles cp ON cp.id = c.profile_id
    WHERE c.id = p_conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_fan_id = v_user_id THEN
    v_role := 'fan';
    UPDATE public.conversations
       SET fan_deleted_at = now()
     WHERE id = p_conversation_id;
  ELSIF v_creator_user_id = v_user_id OR v_chatter_id = v_user_id THEN
    v_role := 'creator';
    UPDATE public.conversations
       SET creator_deleted_at = now()
     WHERE id = p_conversation_id;
  ELSE
    RAISE EXCEPTION 'Forbidden — not a participant of this conversation' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object('success', true, 'side', v_role);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_conversation_for_self(uuid) TO authenticated;

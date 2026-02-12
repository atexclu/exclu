DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'show_join_banner'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles ALTER COLUMN show_join_banner SET DEFAULT true';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'show_certification'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles ALTER COLUMN show_certification SET DEFAULT false';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'show_deeplinks'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles ALTER COLUMN show_deeplinks SET DEFAULT false';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'show_available_now'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles ALTER COLUMN show_available_now SET DEFAULT false';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'is_creator_subscribed'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name IN ('show_join_banner', 'show_certification', 'show_deeplinks', 'show_available_now')
      GROUP BY table_name
      HAVING COUNT(*) = 4
    ) THEN
      EXECUTE $$
        UPDATE public.profiles
        SET
          show_join_banner = true,
          show_certification = false,
          show_deeplinks = false,
          show_available_now = false
        WHERE COALESCE(is_creator_subscribed, false) = false;
      $$;

      EXECUTE $$
        UPDATE public.profiles
        SET
          show_join_banner = false,
          show_certification = true,
          show_deeplinks = true,
          show_available_now = true
        WHERE is_creator_subscribed = true;
      $$;
    END IF;
  END IF;
END $$;

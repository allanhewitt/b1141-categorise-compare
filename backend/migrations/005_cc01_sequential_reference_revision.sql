-- CC01 reference revision for the sequential/mobile-first C&C redesign
-- 2026-09-11
-- Changes learner-facing CC01 wording/order only. Existing session snapshots remain immutable.
-- The activity active flag is deliberately preserved so this migration is safe in production.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM activities
    WHERE id = 'b1141-w1-language-and-assumptions-candc'
      AND model = 'categorise_compare'
      AND config IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'CC01 revision guard failed: canonical CC01 activity is missing or invalid';
  END IF;
END
$$;

UPDATE activities
SET prompt = 'What social assumption, if any, might sit behind this wording?',
    config = config || jsonb_build_object(
      'entry', jsonb_build_object(
        'text', 'Sporting commentary often uses familiar shorthand. Read each comment in its setting and decide what, if anything, the wording might assume.'
      ),
      'classification', (config->'classification') || jsonb_build_object(
        'prompt', 'What social assumption, if any, might sit behind this wording?'
      ),
      'items', jsonb_build_array(
        jsonb_build_object(
          'id','aggressive_woman',
          'content','She’s really aggressive in training.',
          'optional_context',jsonb_build_object('setting','A coach discussing a player','target_or_subject','a woman player'),
          'display_order',1
        ),
        jsonb_build_object(
          'id','natural_black_winger',
          'content','He’s explosive — just a natural athlete.',
          'optional_context',jsonb_build_object('setting','TV commentary','target_or_subject','a Black winger'),
          'display_order',2
        ),
        jsonb_build_object(
          'id','fit_environment',
          'content','He’s talented, but I’m not sure he’ll fit the environment here.',
          'optional_context',jsonb_build_object('setting','An academy selection discussion','target_or_subject','a player from a low-income neighbourhood'),
          'display_order',3
        ),
        jsonb_build_object(
          'id','composed_woman',
          'content','She stayed composed when the game got tight.',
          'optional_context',jsonb_build_object('setting','Post-match analysis','target_or_subject','a woman player'),
          'display_order',4
        ),
        jsonb_build_object(
          'id','inspirational_wheelchair_racer',
          'content','Whatever happens today, just seeing her compete is inspirational.',
          'optional_context',jsonb_build_object('setting','A feature before a race','target_or_subject','a wheelchair racer'),
          'display_order',5
        ),
        jsonb_build_object(
          'id','worked_white_winger',
          'content','He reads the game brilliantly. You can tell he’s worked at it.',
          'optional_context',jsonb_build_object('setting','TV commentary','target_or_subject','a white winger'),
          'display_order',6
        ),
        jsonb_build_object(
          'id','aggressive_man',
          'content','He’s really aggressive in training.',
          'optional_context',jsonb_build_object('setting','A coach discussing a player','target_or_subject','a man player'),
          'display_order',7
        )
      ),
      'guidance', jsonb_build_object(
        'content', jsonb_build_array(
          jsonb_build_object('type','question','text','What in the wording or context led you to your original choice?'),
          jsonb_build_object('type','question','text','Would you read the same words differently if they described someone else?'),
          jsonb_build_object('type','question','text','Is the assumption in the words themselves, the context around them, or the way similar people are usually described?')
        )
      ),
      'resolution', (config->'resolution') || jsonb_build_object(
        'prompt','Having seen how the room interpreted it, what do you think now?'
      )
    ),
    updated_at = now()
WHERE id = 'b1141-w1-language-and-assumptions-candc'
  AND model = 'categorise_compare';

DO $$
DECLARE
  c jsonb;
BEGIN
  SELECT config INTO c
  FROM activities
  WHERE id = 'b1141-w1-language-and-assumptions-candc';

  IF jsonb_array_length(c->'items') <> 7 THEN
    RAISE EXCEPTION 'CC01 revision verification failed: expected 7 items';
  END IF;
  IF c #>> '{items,0,id}' <> 'aggressive_woman'
     OR c #>> '{items,1,id}' <> 'natural_black_winger'
     OR c #>> '{items,5,id}' <> 'worked_white_winger'
     OR c #>> '{items,6,id}' <> 'aggressive_man' THEN
    RAISE EXCEPTION 'CC01 revision verification failed: unexpected case order';
  END IF;
  IF c #>> '{classification,prompt}' <> 'What social assumption, if any, might sit behind this wording?' THEN
    RAISE EXCEPTION 'CC01 revision verification failed: prompt mismatch';
  END IF;
END
$$;

COMMIT;

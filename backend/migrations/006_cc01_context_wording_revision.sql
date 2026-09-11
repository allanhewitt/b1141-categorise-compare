-- CC01 context wording revision
-- 2026-09-11
-- Makes Setting and About read as logically linked parts of each case.
-- Existing session snapshots remain immutable; only the canonical activity config is revised.

BEGIN;

DO $$
DECLARE
  c jsonb;
BEGIN
  SELECT config INTO c
  FROM activities
  WHERE id = 'b1141-w1-language-and-assumptions-candc'
    AND model = 'categorise_compare';

  IF c IS NULL THEN
    RAISE EXCEPTION 'CC01 context revision guard failed: canonical CC01 activity is missing or invalid';
  END IF;

  IF jsonb_array_length(c->'items') <> 7
     OR c #>> '{items,0,id}' <> 'aggressive_woman'
     OR c #>> '{items,1,id}' <> 'natural_black_winger'
     OR c #>> '{items,2,id}' <> 'fit_environment'
     OR c #>> '{items,3,id}' <> 'composed_woman'
     OR c #>> '{items,4,id}' <> 'inspirational_wheelchair_racer'
     OR c #>> '{items,5,id}' <> 'worked_white_winger'
     OR c #>> '{items,6,id}' <> 'aggressive_man' THEN
    RAISE EXCEPTION 'CC01 context revision guard failed: unexpected case set/order';
  END IF;
END
$$;

UPDATE activities
SET config = jsonb_set(
      config,
      '{items}',
      jsonb_build_array(
        (config #> '{items,0}') || jsonb_build_object(
          'optional_context', jsonb_build_object(
            'setting', 'A coach is meeting with the other coaches in the team.',
            'target_or_subject', 'They are discussing one of the women players.'
          )
        ),
        (config #> '{items,1}') || jsonb_build_object(
          'optional_context', jsonb_build_object(
            'setting', 'A TV commentator is describing the action during a match.',
            'target_or_subject', 'They are talking about a Black winger.'
          )
        ),
        (config #> '{items,2}') || jsonb_build_object(
          'optional_context', jsonb_build_object(
            'setting', 'Coaches are discussing players they may recruit to an academy.',
            'target_or_subject', 'They are considering a player from a low-income neighbourhood.'
          )
        ),
        (config #> '{items,3}') || jsonb_build_object(
          'optional_context', jsonb_build_object(
            'setting', 'A TV pundit is analysing the match after the final whistle.',
            'target_or_subject', 'They are discussing one of the women players.'
          )
        ),
        (config #> '{items,4}') || jsonb_build_object(
          'optional_context', jsonb_build_object(
            'setting', 'A broadcaster is introducing a feature before a race.',
            'target_or_subject', 'They are talking about a wheelchair racer.'
          )
        ),
        (config #> '{items,5}') || jsonb_build_object(
          'optional_context', jsonb_build_object(
            'setting', 'A TV commentator is describing the action during a match.',
            'target_or_subject', 'They are talking about a white winger.'
          )
        ),
        (config #> '{items,6}') || jsonb_build_object(
          'optional_context', jsonb_build_object(
            'setting', 'A coach is meeting with the other coaches in the team.',
            'target_or_subject', 'They are discussing one of the men players.'
          )
        )
      ),
      false
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

  IF c #>> '{items,0,optional_context,setting}' <> 'A coach is meeting with the other coaches in the team.'
     OR c #>> '{items,0,optional_context,target_or_subject}' <> 'They are discussing one of the women players.'
     OR c #>> '{items,1,optional_context,setting}' <> c #>> '{items,5,optional_context,setting}'
     OR c #>> '{items,0,optional_context,setting}' <> c #>> '{items,6,optional_context,setting}' THEN
    RAISE EXCEPTION 'CC01 context revision verification failed';
  END IF;
END
$$;

COMMIT;

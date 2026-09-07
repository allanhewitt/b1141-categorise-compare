-- C&C Stage 4 approved learner-facing wording revision
-- 2026-09-03
-- Applies the post-configuration external-consultant wording audit.
-- Updates only approved learner-facing fields; Stage 3 mechanics remain unchanged.
-- Canonical rows remain inactive; deployment and activation belong to Stage 5.

BEGIN;

DO $$
DECLARE
  canonical_count integer;
  active_count integer;
  invalid_count integer;
BEGIN
  SELECT COUNT(*) INTO canonical_count
  FROM activities
  WHERE model = 'categorise_compare';

  SELECT COUNT(*) INTO active_count
  FROM activities
  WHERE model = 'categorise_compare' AND active;

  SELECT COUNT(*) INTO invalid_count
  FROM activities
  WHERE model = 'categorise_compare'
    AND (config IS NULL OR schema_version <> 1);

  IF canonical_count <> 7 THEN
    RAISE EXCEPTION 'Stage 4 wording-revision guard failed: expected 7 canonical C&C rows, found %', canonical_count;
  END IF;

  IF active_count <> 0 THEN
    RAISE EXCEPTION 'Stage 4 wording-revision guard failed: canonical C&C rows must be inactive, found % active', active_count;
  END IF;

  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'Stage 4 wording-revision guard failed: found % canonical C&C rows with invalid config/schema version', invalid_count;
  END IF;

  IF (SELECT config #>> '{items,1,optional_context,target_or_subject}'
      FROM activities
      WHERE id = 'b1141-w1-language-and-assumptions-candc')
      IS DISTINCT FROM 'a white midfielder' THEN
    RAISE EXCEPTION 'Stage 4 wording-revision guard failed: CC01 source wording differs from expected pre-revision value';
  END IF;

  IF (SELECT title
      FROM activities
      WHERE id = 'b1141-w8-four-technological-interventions')
      IS DISTINCT FROM 'Four Technological Interventions' THEN
    RAISE EXCEPTION 'Stage 4 wording-revision guard failed: CC06 source title differs from expected pre-revision value';
  END IF;
END
$$;

-- CC01: isolate the intended racialised-language contrast by keeping playing position matched.
UPDATE activities
SET config = jsonb_set(
      config,
      '{items,1,optional_context,target_or_subject}',
      to_jsonb('a white winger'::text),
      false
    ),
    updated_at = now()
WHERE id = 'b1141-w1-language-and-assumptions-candc'
  AND model = 'categorise_compare';

-- CC02: distinguish a genuine dual effect from interpretive contestation.
UPDATE activities
SET config = jsonb_set(
      config,
      '{categories,2,label}',
      to_jsonb('Both'::text),
      false
    ),
    updated_at = now()
WHERE id = 'b1141-w2-us-them'
  AND model = 'categorise_compare';

-- CC04: remove the undefined "same principle" instruction and use a clearer third category.
UPDATE activities
SET config = jsonb_set(
      jsonb_set(
        config,
        '{entry,text}',
        to_jsonb('Read each sporting act on its own terms before deciding how you would describe it.'::text),
        false
      ),
      '{categories,2,label}',
      to_jsonb('Contested'::text),
      false
    ),
    updated_at = now()
WHERE id = 'b1141-w3-political-or-non-political-candc'
  AND model = 'categorise_compare';

-- CC05: neutralise the category wording, remove a double-barrelled case, and soften the final guidance question.
UPDATE activities
SET config = jsonb_set(
      jsonb_set(
        jsonb_set(
          config,
          '{categories,1,label}',
          to_jsonb('Familiar arrangement'::text),
          false
        ),
        '{items,5,content}',
        to_jsonb('An agreed method of scoring'::text),
        false
      ),
      '{guidance,content,2,text}',
      to_jsonb('Who might be advantaged or disadvantaged when an arrangement is treated as just the way sport is?'::text),
      false
    ),
    updated_at = now()
WHERE id = 'b1141-w4-design-an-inclusive-sport'
  AND model = 'categorise_compare';

-- CC06: broaden the framing from technology to the boundary between access, capacity and comparability.
UPDATE activities
SET title = 'What Counts as an Advantage?',
    prompt = 'What does this case primarily affect?',
    config = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      config,
                      '{entry,text}',
                      to_jsonb('Consider each case on its own terms before deciding what kind of change is taking place.'::text),
                      false
                    ),
                    '{classification,prompt}',
                    to_jsonb('What does this case primarily affect?'::text),
                    false
                  ),
                  '{categories,0,label}',
                  to_jsonb('Access to participation'::text),
                  false
                ),
                '{categories,1,label}',
                to_jsonb('Athletic capacity'::text),
                false
              ),
              '{categories,2,label}',
              to_jsonb('The terms of comparison'::text),
              false
            ),
            '{categories,3,label}',
            to_jsonb('A contested boundary'::text),
            false
          ),
          '{guidance,content,0,text}',
          to_jsonb('What is actually changing here: access to participation, the athlete’s capacity, or the basis on which performances are compared?'::text),
          false
        ),
        '{guidance,content,1,text}',
        to_jsonb('Would you classify it differently if the rules permitted it?'::text),
        false
      ),
      '{guidance,content,2,text}',
      to_jsonb('Where does an advantage become a different kind of performance altogether?'::text),
      false
    ),
    updated_at = now()
WHERE id = 'b1141-w8-four-technological-interventions'
  AND model = 'categorise_compare';

-- CC07: simplify framing, bound factual claims, and remove the answer cue from the final case.
UPDATE activities
SET config = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                config,
                '{entry,text}',
                to_jsonb('These observations compare Qatar 2022 with the 2026 World Cup. Decide what kind of comparison each one supports.'::text),
                false
              ),
              '{items,0,content}',
              to_jsonb('Qatar 2022 had 32 teams and 64 matches in one compact host country; the 2026 World Cup had 48 teams and 104 matches across three countries and 16 host cities.'::text),
              false
            ),
            '{items,1,content}',
            to_jsonb('Qatar 2022 was played in November and December; the 2026 World Cup was played in June and July.'::text),
            false
          ),
          '{items,2,content}',
          to_jsonb('Human-rights criticism around Qatar 2022 focused heavily on migrant labour and the conditions under which tournament infrastructure was produced; criticism around the 2026 World Cup included different issues, including immigration enforcement and discrimination in the host countries.'::text),
          false
        ),
        '{items,3,content}',
        to_jsonb('Around both tournaments, there were arguments about whether issues such as workers’ rights, discrimination and state policy belonged in discussion of the World Cup at all, or whether attention should remain on football.'::text),
        false
      ),
      '{items,5,content}',
      to_jsonb('One tournament was extraordinarily geographically concentrated and the other extraordinarily geographically dispersed.'::text),
      false
    ),
    updated_at = now()
WHERE id = 'b1141-w9-the-comparison'
  AND model = 'categorise_compare';

DO $$
DECLARE
  failed_count integer;
BEGIN
  SELECT COUNT(*) INTO failed_count
  FROM (
    SELECT 1
    FROM activities
    WHERE id = 'b1141-w1-language-and-assumptions-candc'
      AND config #>> '{items,1,optional_context,target_or_subject}' = 'a white winger'

    UNION ALL

    SELECT 1
    FROM activities
    WHERE id = 'b1141-w2-us-them'
      AND config #>> '{categories,2,label}' = 'Both'

    UNION ALL

    SELECT 1
    FROM activities
    WHERE id = 'b1141-w3-political-or-non-political-candc'
      AND config #>> '{entry,text}' = 'Read each sporting act on its own terms before deciding how you would describe it.'
      AND config #>> '{categories,2,label}' = 'Contested'

    UNION ALL

    SELECT 1
    FROM activities
    WHERE id = 'b1141-w4-design-an-inclusive-sport'
      AND config #>> '{categories,1,label}' = 'Familiar arrangement'
      AND config #>> '{items,5,content}' = 'An agreed method of scoring'
      AND config #>> '{guidance,content,2,text}' = 'Who might be advantaged or disadvantaged when an arrangement is treated as just the way sport is?'

    UNION ALL

    SELECT 1
    FROM activities
    WHERE id = 'b1141-w8-four-technological-interventions'
      AND title = 'What Counts as an Advantage?'
      AND prompt = 'What does this case primarily affect?'
      AND config #>> '{classification,prompt}' = 'What does this case primarily affect?'
      AND config #>> '{categories,0,label}' = 'Access to participation'
      AND config #>> '{categories,1,label}' = 'Athletic capacity'
      AND config #>> '{categories,2,label}' = 'The terms of comparison'
      AND config #>> '{categories,3,label}' = 'A contested boundary'

    UNION ALL

    SELECT 1
    FROM activities
    WHERE id = 'b1141-w9-the-comparison'
      AND config #>> '{entry,text}' = 'These observations compare Qatar 2022 with the 2026 World Cup. Decide what kind of comparison each one supports.'
      AND config #>> '{items,5,content}' = 'One tournament was extraordinarily geographically concentrated and the other extraordinarily geographically dispersed.'
  ) AS checks;

  IF failed_count <> 6 THEN
    RAISE EXCEPTION 'Stage 4 wording-revision verification failed: expected 6 revised-instance checks, got %', failed_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM activities
    WHERE model = 'categorise_compare' AND active
  ) THEN
    RAISE EXCEPTION 'Stage 4 wording-revision verification failed: canonical C&C rows must remain inactive';
  END IF;
END
$$;

COMMIT;

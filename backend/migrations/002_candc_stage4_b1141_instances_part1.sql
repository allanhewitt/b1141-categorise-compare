-- C&C Stage 4 B1141 canonical instance configuration (part 1 of 2)
-- 2026-09-03
-- Adds canonical teaching configurations while preserving legacy rows.
-- Canonical rows remain inactive; deployment and activation belong to Stage 5.

BEGIN;

DO $$
DECLARE
  canonical_count integer;
  target_collision_count integer;
BEGIN
  SELECT COUNT(*) INTO canonical_count
  FROM activities
  WHERE model = 'categorise_compare';

  IF canonical_count <> 0 THEN
    RAISE EXCEPTION 'Stage 4 guard failed: expected 0 canonical C&C rows before this migration, found %', canonical_count;
  END IF;

  SELECT COUNT(*) INTO target_collision_count
  FROM activities
  WHERE id IN (
      'b1141-w1-language-and-assumptions',
      'b1141-w2-us-them',
      'b1141-w2-does-this-change-the-system'
  );

  IF target_collision_count <> 0 THEN
    RAISE EXCEPTION 'Stage 4 guard failed: one or more target IDs already exist (% collisions)', target_collision_count;
  END IF;
END
$$;

INSERT INTO activities (
  id, module, week, activity, sequence, prompt, items, categories, exclusive,
  reveal_mode, reveal_threshold, cohort_size, active, model, title, config, schema_version
) VALUES
  ('b1141-w1-language-and-assumptions', 'B1141', 1, 'language-and-assumptions', 2,
   'What, if anything, might this wording assume?', '[]'::jsonb, '[]'::jsonb, false,
   'manual', NULL, NULL, false, 'categorise_compare', 'Language and Assumptions',
   $cfg${"entry":{"text":"Sporting commentary often uses familiar shorthand. Read each comment in its setting."},"classification":{"mode":"multi_tag","prompt":"What, if anything, might this wording assume?","response_required_per_item":true,"min_tag_selections":0,"max_tag_selections":4,"explicit_none":{"enabled":true,"id":"no_clear_assumption","label":"I don't see a clear social assumption here","mutually_exclusive_with_tags":true}},"items":[{"id":"natural_black_winger","content":"He’s explosive — just a natural athlete.","optional_context":{"setting":"TV commentary","target_or_subject":"a Black winger"},"display_order":1},{"id":"worked_white_midfielder","content":"He reads the game brilliantly. You can tell he’s worked at it.","optional_context":{"setting":"TV commentary","target_or_subject":"a white midfielder"},"display_order":2},{"id":"aggressive_woman","content":"She’s really aggressive in training.","optional_context":{"setting":"A coach discussing a player","target_or_subject":"a woman player"},"display_order":3},{"id":"aggressive_man","content":"He’s really aggressive in training.","optional_context":{"setting":"A coach discussing a player","target_or_subject":"a man player"},"display_order":4},{"id":"inspirational_wheelchair_racer","content":"Whatever happens today, just seeing her compete is inspirational.","optional_context":{"setting":"A feature before a race","target_or_subject":"a wheelchair racer"},"display_order":5},{"id":"fit_environment","content":"He’s talented, but I’m not sure he’ll fit the environment here.","optional_context":{"setting":"An academy selection discussion","target_or_subject":"a player from a low-income area"},"display_order":6},{"id":"composed_woman","content":"She stayed composed when the game got tight.","optional_context":{"setting":"Post-match analysis","target_or_subject":"a woman player"},"display_order":7}],"categories":[{"id":"gender","label":"Gender-related assumption","display_order":1},{"id":"race_ethnicity","label":"Race/ethnicity-related assumption","display_order":2},{"id":"ability_disability","label":"Ability/disability-related assumption","display_order":3},{"id":"class_status","label":"Class/status-related assumption","display_order":4}],"commitment":{"submission_mode":"batch","require_complete_set":true},"confrontation":{"source":"cohort_computational","reveal_mode":"lecturer_gated","show_learner_original":true,"diagnostic_rule":"highest_divergence","required_outputs":["completion_count","item_category_distribution","divergence_by_item","selected_diagnostic_item"]},"guidance":{"content":[{"type":"question","text":"What is it about this comment that makes it possible to read in more than one way?"},{"type":"question","text":"Would it feel different if the same words were used about somebody else?"},{"type":"question","text":"Can ordinary sporting language carry assumptions even when nobody intends it to?"}]},"resolution":{"pattern":"divergence","diagnostic_item_source":"confrontation","allow_revision":true,"revision_mode":"edit_tag_set","prompt":"Looking at it again, where are you now?","options":[{"id":"keep_same","label":"I’d keep the same reading","display_order":1},{"id":"recognise_other_keep_mine","label":"I can see another reading, but I’d keep mine","display_order":2},{"id":"change_tagging","label":"I’d change or extend my labels","display_order":3}]},"lecturer":{"pre_reveal_view":"response_count_only","reveal_control":"manual","projector_summary":true,"reset_session":true}}$cfg$::jsonb, 1),
  ('b1141-w2-us-them', 'B1141', 2, 'us-them', 2,
   'What does each behaviour create?', '[]'::jsonb, '[]'::jsonb, true,
   'manual', NULL, NULL, false, 'categorise_compare', 'When Does “Us” Become “Them”?',
   $cfg${"entry":{"text":"Read each crowd behaviour and decide where you would place it."},"classification":{"mode":"exclusive","prompt":"What does each behaviour create?","response_required_per_item":true,"min_tag_selections":null,"max_tag_selections":1,"explicit_none":{"enabled":false}},"items":[{"id":"shared_chant","content":"A whole stand joining in the same chant","display_order":1},{"id":"coordinated_display","content":"Supporters organising a coordinated display before kick-off","display_order":2},{"id":"boo_opposition","content":"Booing an opposition player every time they get the ball","display_order":3},{"id":"hostile_rival_city","content":"A hostile chant about a rival city","display_order":4},{"id":"pitch_invasion","content":"Supporters running onto the pitch after a dramatic win","display_order":5},{"id":"challenge_racist_abuse","content":"Supporters confronting racist abuse from people in their own section","display_order":6}],"categories":[{"id":"belonging","label":"Belonging","display_order":1},{"id":"exclusion","label":"Exclusion","display_order":2},{"id":"both_contested","label":"Both / contested","display_order":3}],"commitment":{"submission_mode":"batch","require_complete_set":true},"confrontation":{"source":"cohort_computational","reveal_mode":"lecturer_gated","show_learner_original":true,"diagnostic_rule":"highest_divergence","required_outputs":["completion_count","item_category_distribution","divergence_by_item","selected_diagnostic_item"]},"guidance":{"content":[{"type":"question","text":"What is it about this behaviour that makes it difficult to place clearly in only one category?"},{"type":"question","text":"Does its effect depend on who is involved, who is affected, and what is happening around it?"},{"type":"question","text":"Can the same act strengthen a sense of us while also creating a them?"}]},"resolution":{"pattern":"divergence","diagnostic_item_source":"confrontation","allow_revision":true,"revision_mode":"replace","prompt":"Looking at it again, where are you now?","options":[{"id":"keep_same","label":"I’d keep the same classification","display_order":1},{"id":"recognise_other_keep_mine","label":"I can see another reading, but I’d keep mine","display_order":2},{"id":"change_classification","label":"I’d change my classification","display_order":3}]},"lecturer":{"pre_reveal_view":"response_count_only","reveal_control":"manual","projector_summary":true,"reset_session":true}}$cfg$::jsonb, 1),
  ('b1141-w2-does-this-change-the-system', 'B1141', 2, 'does-this-change-the-system', 5,
   'What does each intervention actually change?', '[]'::jsonb, '[]'::jsonb, true,
   'manual', NULL, NULL, false, 'categorise_compare', 'Does This Actually Change the System?',
   $cfg${"entry":{"text":"Look at each intervention and focus on what it actually changes."},"classification":{"mode":"exclusive","prompt":"What does each intervention actually change?","response_required_per_item":true,"min_tag_selections":null,"max_tag_selections":1,"explicit_none":{"enabled":false}},"items":[{"id":"confidential_counselling","content":"Confidential counselling available to athletes","display_order":1},{"id":"resilience_training","content":"Mandatory resilience training for athletes","display_order":2},{"id":"reduce_competitions","content":"Reducing the number of competitions in the season","display_order":3},{"id":"withdraw_without_penalty","content":"Allowing athletes to withdraw from competition without a selection penalty","display_order":4},{"id":"coach_distress_training","content":"Training coaches to recognise signs of distress","display_order":5},{"id":"contract_selection_reform","content":"Changing contracts and selection policies that reward competing while injured or unwell","display_order":6}],"categories":[{"id":"supports_individual","label":"Supports the individual","display_order":1},{"id":"changes_system","label":"Changes the system","display_order":2},{"id":"both","label":"Both","display_order":3}],"commitment":{"submission_mode":"batch","require_complete_set":true},"confrontation":{"source":"cohort_computational","reveal_mode":"lecturer_gated","show_learner_original":true,"diagnostic_rule":"highest_divergence","required_outputs":["completion_count","item_category_distribution","divergence_by_item","selected_diagnostic_item"]},"guidance":{"content":[{"type":"question","text":"Does this intervention make it easier for someone to cope, or does it change the conditions creating the pressure?"},{"type":"question","text":"Would the original problem still exist for the next athlete who entered the same environment?"},{"type":"question","text":"Can an intervention support individuals and still change something structural at the same time?"}]},"resolution":{"pattern":"divergence","diagnostic_item_source":"confrontation","allow_revision":true,"revision_mode":"replace","prompt":"Looking at it again, where are you now?","options":[{"id":"keep_same","label":"I’d keep the same classification","display_order":1},{"id":"recognise_other_keep_mine","label":"I can see another reading, but I’d keep mine","display_order":2},{"id":"change_classification","label":"I’d change my classification","display_order":3}]},"lecturer":{"pre_reveal_view":"response_count_only","reveal_control":"manual","projector_summary":true,"reset_session":true}}$cfg$::jsonb, 1);

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

  IF canonical_count <> 3 THEN
    RAISE EXCEPTION 'Stage 4 verification failed: expected 3 canonical C&C rows, found %', canonical_count;
  END IF;

  IF active_count <> 0 THEN
    RAISE EXCEPTION 'Stage 4 verification failed: canonical C&C rows must remain inactive, found % active', active_count;
  END IF;

  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'Stage 4 verification failed: found % canonical C&C rows with invalid config/schema version', invalid_count;
  END IF;
END
$$;

COMMIT;

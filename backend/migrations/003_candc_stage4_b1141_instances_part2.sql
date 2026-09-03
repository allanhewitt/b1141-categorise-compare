-- C&C Stage 4 B1141 canonical instance configuration (part 2 of 2)
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

  IF canonical_count <> 3 THEN
    RAISE EXCEPTION 'Stage 4 guard failed: expected 3 canonical C&C rows before this migration, found %', canonical_count;
  END IF;

  SELECT COUNT(*) INTO target_collision_count
  FROM activities
  WHERE id IN (
      'b1141-w3-political-or-non-political-candc',
      'b1141-w4-design-an-inclusive-sport',
      'b1141-w8-four-technological-interventions',
      'b1141-w9-the-comparison'
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
  ('b1141-w3-political-or-non-political-candc', 'B1141', 3, 'political-or-non-political-candc', 1,
   'How would you describe each act?', '[]'::jsonb, '[]'::jsonb, true,
   'manual', NULL, NULL, false, 'categorise_compare', 'Political or Non-Political?',
   $cfg${"entry":{"text":"Read each sporting act and apply the same principle when deciding how to describe it."},"classification":{"mode":"exclusive","prompt":"How would you describe each act?","response_required_per_item":true,"min_tag_selections":null,"max_tag_selections":1,"explicit_none":{"enabled":false}},"items":[{"id":"taking_knee","content":"Players taking the knee before a match to protest racial injustice","display_order":1},{"id":"flower_of_scotland","content":"Players singing Flower of Scotland before a Scotland international","display_order":2},{"id":"remembrance_poppy","content":"Players wearing a remembrance poppy on their shirt","display_order":3},{"id":"lgbtq_armband","content":"A captain wearing an armband supporting LGBTQ+ inclusion","display_order":4},{"id":"saltires","content":"Supporters displaying Saltires at a Scotland international","display_order":5},{"id":"refuse_remembrance","content":"An athlete refusing to take part in an official remembrance ceremony","display_order":6}],"categories":[{"id":"political","label":"Political","display_order":1},{"id":"non_political","label":"Non-political","display_order":2},{"id":"both_contested","label":"Both / contested","display_order":3}],"commitment":{"submission_mode":"batch","require_complete_set":true},"confrontation":{"source":"cohort_computational","reveal_mode":"lecturer_gated","show_learner_original":true,"diagnostic_rule":"highest_divergence","required_outputs":["completion_count","item_category_distribution","divergence_by_item","selected_diagnostic_item"]},"guidance":{"content":[{"type":"question","text":"What makes one of these acts feel more obviously political than another?"},{"type":"question","text":"Does an action become non-political because it is traditional or widely accepted?"},{"type":"question","text":"Who gets to decide which symbols count as normal and which count as political?"}]},"resolution":{"pattern":"divergence","diagnostic_item_source":"confrontation","allow_revision":true,"revision_mode":"replace","prompt":"Looking at it again, where are you now?","options":[{"id":"keep_same","label":"I’d keep the same classification","display_order":1},{"id":"recognise_other_keep_mine","label":"I can see another reading, but I’d keep mine","display_order":2},{"id":"change_classification","label":"I’d change my classification","display_order":3}]},"lecturer":{"pre_reveal_view":"response_count_only","reveal_control":"manual","projector_summary":true,"reset_session":true}}$cfg$::jsonb, 1),
  ('b1141-w4-design-an-inclusive-sport', 'B1141', 4, 'design-an-inclusive-sport', 2,
   'Which features are necessary for the sport to function, and which are arrangements we have become used to?', '[]'::jsonb, '[]'::jsonb, true,
   'manual', NULL, NULL, false, 'categorise_compare', 'Design an Inclusive Sport',
   $cfg${"entry":{"text":"Imagine the sport were being designed from scratch. Look at each familiar feature separately."},"classification":{"mode":"exclusive","prompt":"Which features are necessary for the sport to function, and which are arrangements we have become used to?","response_required_per_item":true,"min_tag_selections":null,"max_tag_selections":1,"explicit_none":{"enabled":false}},"items":[{"id":"gendered_changing","content":"Separate changing facilities for men and women","display_order":1},{"id":"standard_kit","content":"A rule that all players must wear the same standard kit","display_order":2},{"id":"male_female_categories","content":"Competitions divided into male and female categories","display_order":3},{"id":"standing_spectators","content":"Spectators expected to stand for long periods at some venues","display_order":4},{"id":"weekend_scheduling","content":"Match times scheduled around traditional weekend patterns","display_order":5},{"id":"playing_area_scoring","content":"A fixed playing area and agreed method of scoring","display_order":6}],"categories":[{"id":"game_requirement","label":"Genuine game requirement","display_order":1},{"id":"unexamined_assumption","label":"Unexamined assumption","display_order":2}],"commitment":{"submission_mode":"batch","require_complete_set":true},"confrontation":{"source":"cohort_computational","reveal_mode":"lecturer_gated","show_learner_original":true,"diagnostic_rule":"highest_divergence","required_outputs":["completion_count","item_category_distribution","divergence_by_item","selected_diagnostic_item"]},"guidance":{"content":[{"type":"question","text":"If this feature changed, would the game itself stop working?"},{"type":"question","text":"Is the feature required by the logic of the sport, or by tradition, convenience, facilities or social expectations?"},{"type":"question","text":"Who is advantaged when an arrangement is treated as just the way sport is?"}]},"resolution":{"pattern":"divergence","diagnostic_item_source":"confrontation","allow_revision":true,"revision_mode":"replace","prompt":"Looking at it again, where are you now?","options":[{"id":"keep_same","label":"I’d keep the same classification","display_order":1},{"id":"recognise_other_keep_mine","label":"I can see another reading, but I’d keep mine","display_order":2},{"id":"change_classification","label":"I’d change my classification","display_order":3}]},"lecturer":{"pre_reveal_view":"response_count_only","reveal_control":"manual","projector_summary":true,"reset_session":true}}$cfg$::jsonb, 1),
  ('b1141-w8-four-technological-interventions', 'B1141', 8, 'four-technological-interventions', 3,
   'What kind of intervention is this?', '[]'::jsonb, '[]'::jsonb, true,
   'manual', NULL, NULL, false, 'categorise_compare', 'Four Technological Interventions',
   $cfg${"entry":{"text":"Consider each intervention on its own terms before comparing where you would draw the boundaries."},"classification":{"mode":"exclusive","prompt":"What kind of intervention is this?","response_required_per_item":true,"min_tag_selections":null,"max_tag_selections":1,"explicit_none":{"enabled":false}},"items":[{"id":"running_blades","content":"A bilateral amputee sprinter competing using carbon-fibre running blades","display_order":1},{"id":"eligibility_classification","content":"An athlete whose eligibility category is disputed because their physiology does not fit neatly within the existing classification rules","display_order":2},{"id":"altitude_tent","content":"An endurance athlete using an altitude tent at home to stimulate physiological adaptation","display_order":3},{"id":"epo_microdosing","content":"An endurance athlete using micro-doses of EPO to increase red-blood-cell production","display_order":4}],"categories":[{"id":"correction_enabling","label":"Correction / enabling","display_order":1},{"id":"enhancement","label":"Enhancement","display_order":2},{"id":"redefines_performance","label":"Redefines performance","display_order":3},{"id":"both_contested","label":"Both / contested","display_order":4}],"commitment":{"submission_mode":"batch","require_complete_set":true},"confrontation":{"source":"cohort_computational","reveal_mode":"lecturer_gated","show_learner_original":true,"diagnostic_rule":"highest_divergence","required_outputs":["completion_count","item_category_distribution","divergence_by_item","selected_diagnostic_item"]},"guidance":{"content":[{"type":"question","text":"What is the intervention changing: access to performance, the athlete’s capacity, or the conditions under which performance is produced?"},{"type":"question","text":"Where would you draw the line between restoring an opportunity and creating an advantage?"},{"type":"question","text":"Is the important difference the technology itself, its effect, who can access it, or whether the rules permit it?"}]},"resolution":{"pattern":"divergence","diagnostic_item_source":"confrontation","allow_revision":true,"revision_mode":"replace","prompt":"Looking at it again, where are you now?","options":[{"id":"keep_same","label":"I’d keep the same classification","display_order":1},{"id":"recognise_other_keep_mine","label":"I can see another reading, but I’d keep mine","display_order":2},{"id":"change_classification","label":"I’d change my classification","display_order":3}]},"lecturer":{"pre_reveal_view":"response_count_only","reveal_control":"manual","projector_summary":true,"reset_session":true}}$cfg$::jsonb, 1),
  ('b1141-w9-the-comparison', 'B1141', 9, 'the-comparison', 3,
   'What kind of comparison is this?', '[]'::jsonb, '[]'::jsonb, true,
   'manual', NULL, NULL, false, 'categorise_compare', 'The Comparison',
   $cfg${"entry":{"text":"These observations compare Qatar 2022 with World Cup 2026. Decide what kind of analytical claim each observation can support."},"classification":{"mode":"exclusive","prompt":"What kind of comparison is this?","response_required_per_item":true,"min_tag_selections":null,"max_tag_selections":1,"explicit_none":{"enabled":false}},"items":[{"id":"scale_geography","content":"Qatar 2022 had 32 teams and 64 matches in one compact host country; World Cup 2026 had 48 teams and 104 matches across three countries and 16 host cities.","display_order":1},{"id":"season_timing","content":"Qatar 2022 was played in November and December; World Cup 2026 was played in June and July.","display_order":2},{"id":"human_rights_focus","content":"Human-rights criticism of Qatar focused heavily on migrant labour and the conditions under which tournament infrastructure was produced; 2026 criticism focused on different issues, including immigration enforcement and discrimination in the host countries.","display_order":3},{"id":"keep_politics_out","content":"Both tournaments generated arguments about whether issues such as workers’ rights, discrimination and state policy belonged in discussion of the World Cup at all, or whether attention should remain on football.","display_order":4},{"id":"hosting_history","content":"Qatar was hosting the World Cup for the first time; in 2026 Mexico was hosting for the third time, the USA for the second, while Canada hosted the men’s tournament for the first time.","display_order":5},{"id":"concentrated_dispersed","content":"One tournament was extraordinarily geographically concentrated and the other extraordinarily geographically dispersed — but that fact alone does not tell us whether one model was socially, economically or environmentally preferable.","display_order":6}],"categories":[{"id":"meaningful_difference","label":"Sociologically meaningful difference","display_order":1},{"id":"surface_difference","label":"Surface / contextual difference","display_order":2},{"id":"meaningful_similarity","label":"Meaningful similarity","display_order":3},{"id":"needs_interpretation","label":"Needs more interpretation","display_order":4}],"commitment":{"submission_mode":"batch","require_complete_set":true},"confrontation":{"source":"cohort_computational","reveal_mode":"lecturer_gated","show_learner_original":true,"diagnostic_rule":"highest_divergence","required_outputs":["completion_count","item_category_distribution","divergence_by_item","selected_diagnostic_item"]},"guidance":{"content":[{"type":"question","text":"What would have to follow from this difference for it to matter sociologically?"},{"type":"question","text":"Are we comparing what the tournaments looked like, or the structures and relationships that produced them?"},{"type":"question","text":"What additional evidence would you need before drawing a conclusion from this comparison?"}]},"resolution":{"pattern":"divergence","diagnostic_item_source":"confrontation","allow_revision":true,"revision_mode":"replace","prompt":"Looking at it again, where are you now?","options":[{"id":"keep_same","label":"I’d keep the same classification","display_order":1},{"id":"recognise_other_keep_mine","label":"I can see another reading, but I’d keep mine","display_order":2},{"id":"change_classification","label":"I’d change my classification","display_order":3}]},"lecturer":{"pre_reveal_view":"response_count_only","reveal_control":"manual","projector_summary":true,"reset_session":true}}$cfg$::jsonb, 1);

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
    RAISE EXCEPTION 'Stage 4 verification failed: expected 7 canonical C&C rows, found %', canonical_count;
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

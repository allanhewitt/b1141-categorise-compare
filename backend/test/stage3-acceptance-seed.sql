-- Stage 3 acceptance fixtures only. These are created in ephemeral CI databases and
-- are not production Stage 4 teaching configurations.

INSERT INTO activities (
  id, module, week, activity, sequence, prompt, items, categories, exclusive,
  reveal_mode, reveal_threshold, cohort_size, active, model, title, config, schema_version
) VALUES (
  'b1141-w1-language-and-assumptions-candc', 'B1141', 1, 'language-and-assumptions', 2,
  'Acceptance fixture', '[]'::jsonb, '[]'::jsonb, false, 'manual', NULL, NULL, true,
  'categorise_compare', 'Language and assumptions',
  $cfg$
  {
    "entry":{"text":"Sporting commentary often uses familiar shorthand. Read each comment in its setting."},
    "classification":{
      "mode":"multi_tag",
      "prompt":"What, if anything, might this wording assume?",
      "response_required_per_item":true,
      "min_tag_selections":0,
      "max_tag_selections":4,
      "explicit_none":{"enabled":true,"id":"no_clear_assumption","label":"I don't see a clear social assumption here","mutually_exclusive_with_tags":true}
    },
    "items":[
      {"id":"natural_athlete","content":"He’s just a natural athlete — you can’t teach that.","optional_context":{"setting":"TV commentary","situation":"Athletics"},"display_order":1},
      {"id":"aggressive","content":"She’s really aggressive in training.","optional_context":{"setting":"Training ground","situation":"Women’s football"},"display_order":2},
      {"id":"captain_material","content":"He doesn’t really look like captain material.","optional_context":{"setting":"Selection discussion","situation":"Club sport"},"display_order":3}
    ],
    "categories":[
      {"id":"gender","label":"Gender-related assumption","display_order":1},
      {"id":"race_ethnicity","label":"Race/ethnicity-related assumption","display_order":2},
      {"id":"ability_disability","label":"Ability/disability-related assumption","display_order":3},
      {"id":"class_status","label":"Class/status-related assumption","display_order":4}
    ],
    "commitment":{"submission_mode":"batch","require_complete_set":true},
    "confrontation":{"source":"cohort_computational","reveal_mode":"lecturer_gated","show_learner_original":true,"diagnostic_rule":"highest_divergence","required_outputs":["completion_count","item_category_distribution","divergence_by_item","selected_diagnostic_item"]},
    "guidance":{"content":[
      {"type":"question","text":"What is it about this comment that makes it possible to read in more than one way?"},
      {"type":"question","text":"Would it feel different if the same words were used about somebody else?"},
      {"type":"question","text":"Can ordinary sporting language carry assumptions even when nobody intends it to?"}
    ]},
    "resolution":{"pattern":"divergence","diagnostic_item_source":"confrontation","allow_revision":true,"revision_mode":"edit_tag_set","prompt":"Looking at it again, where are you now?","options":[
      {"id":"keep_same","label":"I’d keep the same reading","display_order":1},
      {"id":"recognise_other_keep_mine","label":"I can see another reading, but I’d keep mine","display_order":2},
      {"id":"change_tagging","label":"I’d change or extend my labels","display_order":3}
    ]},
    "lecturer":{"pre_reveal_view":"response_count_only","reveal_control":"manual","projector_summary":true,"reset_session":true}
  }
  $cfg$::jsonb, 1
),
(
  'b1141-w2-us-them', 'B1141', 2, 'us-them', 1,
  'Acceptance fixture', '[]'::jsonb, '[]'::jsonb, true, 'manual', NULL, NULL, true,
  'categorise_compare', 'When does us become them?',
  $cfg$
  {
    "entry":{"text":"Read each crowd behaviour and decide where you would place it."},
    "classification":{
      "mode":"exclusive",
      "prompt":"What does each behaviour create?",
      "response_required_per_item":true,
      "min_tag_selections":null,
      "max_tag_selections":1,
      "explicit_none":{"enabled":false}
    },
    "items":[
      {"id":"shared_chant","content":"A whole stand joining in the same chant","display_order":1},
      {"id":"hostile_rival","content":"A hostile chant about a rival city","display_order":2},
      {"id":"challenge_abuse","content":"Supporters confronting racist abuse from people in their own section","display_order":3}
    ],
    "categories":[
      {"id":"belonging","label":"Belonging","display_order":1},
      {"id":"exclusion","label":"Exclusion","display_order":2},
      {"id":"both_contested","label":"Both / contested","display_order":3}
    ],
    "commitment":{"submission_mode":"batch","require_complete_set":true},
    "confrontation":{"source":"cohort_computational","reveal_mode":"lecturer_gated","show_learner_original":true,"diagnostic_rule":"highest_divergence","required_outputs":["completion_count","item_category_distribution","divergence_by_item","selected_diagnostic_item"]},
    "guidance":{"content":[
      {"type":"question","text":"What is it about this behaviour that makes it difficult to place clearly in only one category?"},
      {"type":"question","text":"Does its effect depend on who is involved, who is affected, and what is happening around it?"},
      {"type":"question","text":"Can the same act strengthen a sense of us while also creating a them?"}
    ]},
    "resolution":{"pattern":"divergence","diagnostic_item_source":"confrontation","allow_revision":true,"revision_mode":"replace","prompt":"Looking at it again, where are you now?","options":[
      {"id":"keep_same","label":"I’d keep the same classification","display_order":1},
      {"id":"recognise_other_keep_mine","label":"I can see another reading, but I’d keep mine","display_order":2},
      {"id":"change_classification","label":"I’d change my classification","display_order":3}
    ]},
    "lecturer":{"pre_reveal_view":"response_count_only","reveal_control":"manual","projector_summary":true,"reset_session":true}
  }
  $cfg$::jsonb, 1
)
ON CONFLICT (id) DO UPDATE SET
  model = EXCLUDED.model,
  title = EXCLUDED.title,
  config = EXCLUDED.config,
  schema_version = EXCLUDED.schema_version,
  active = true;

-- CC01 configurable pedagogical copy
-- 2026-09-11
-- Moves learning-framing language out of React and into activity configuration.
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
    RAISE EXCEPTION 'CC01 configurable-copy guard failed: canonical CC01 activity is missing or invalid';
  END IF;
END
$$;

UPDATE activities
SET config = config || jsonb_build_object(
      'copy', jsonb_build_object(
        'entry', jsonb_build_object(
          'eyebrow', 'What do you notice?',
          'note', 'You can change your answers before you finish.'
        ),
        'review', jsonb_build_object(
          'eyebrow', 'Review your choices',
          'heading', 'Have a look across the full set before you finish.',
          'instruction', 'You can still change anything.',
          'confirm_heading', 'Finish and submit these choices?',
          'confirm_text', 'Submit these choices? They stay locked until the group comparison.'
        ),
        'waiting', jsonb_build_object(
          'eyebrow', 'Choices submitted',
          'heading', 'Your choices are locked in.',
          'text', 'We’ll compare how the room interpreted the cases shortly.'
        ),
        'comparison', jsonb_build_object(
          'student_eyebrow', 'How did the room read these cases?',
          'presentation_eyebrow', 'How did the group classify these cases?',
          'heading', 'Look for where responses clustered — and where they differed.',
          'diagnostic_note', 'This case produced the widest spread of responses.',
          'lecturer_diagnostic_note', 'This case produced the widest spread of responses in the frozen group response.',
          'presentation_diagnostic_note', 'The highlighted card produced the widest spread of responses.',
          'action', 'Look more closely'
        ),
        'diagnostic', jsonb_build_object(
          'eyebrow', 'A case worth looking at again',
          'heading', 'What might explain the different readings?',
          'revision_instruction', 'Change the labels for this case only.'
        ),
        'completion', jsonb_build_object(
          'eyebrow', 'Done',
          'heading', 'You’ve completed this activity.',
          'text', 'The important question is not whether everyone agrees. It is what our different readings reveal about the assumptions we bring to apparently ordinary language.'
        ),
        'presentation', jsonb_build_object(
          'collecting_heading', 'Complete the activity on your own device.',
          'submitted_label', 'responses submitted',
          'gallery_instruction', 'Select a case to look more closely at the response pattern.',
          'diagnostic_marker', 'widest response spread',
          'room_response_heading', 'Room response'
        )
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

  IF c #>> '{copy,comparison,heading}' <> 'Look for where responses clustered — and where they differed.'
     OR c #>> '{copy,diagnostic,heading}' <> 'What might explain the different readings?'
     OR c #>> '{copy,presentation,room_response_heading}' <> 'Room response' THEN
    RAISE EXCEPTION 'CC01 configurable-copy verification failed';
  END IF;
END
$$;

COMMIT;

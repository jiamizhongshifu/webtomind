-- A retry after writing an asset but before finalizing its task must reuse it.
-- Abort on pre-existing duplicates so they can be reviewed, never delete assets.
SET LOCAL lock_timeout = '5s';
CREATE UNIQUE INDEX IF NOT EXISTS video_generations_task_unique_idx
ON public.video_generations(task_id) WHERE task_id IS NOT NULL;

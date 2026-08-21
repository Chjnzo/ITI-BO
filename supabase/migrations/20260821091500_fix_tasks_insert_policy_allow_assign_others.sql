-- "Authenticated users can insert tasks" required auth.uid() = agente_id,
-- blocking task creation whenever an agent assigns the task to a teammate
-- via the "Assegnato a" selector in TaskModal.tsx (any agente_id other than
-- the current user's own id violated the WITH CHECK). Widened to match the
-- UPDATE policy's intent (any authenticated agent can manage any task).
DROP POLICY "Authenticated users can insert tasks" ON public.tasks;
CREATE POLICY "Authenticated users can insert tasks"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

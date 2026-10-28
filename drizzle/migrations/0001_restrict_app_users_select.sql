DROP POLICY IF EXISTS "directory readable by signed-in users" ON public.app_users;
CREATE POLICY "users read own persona" ON public.app_users FOR SELECT TO authenticated USING (auth_id = auth.uid());
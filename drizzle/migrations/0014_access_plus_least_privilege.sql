REVOKE ALL ON TABLE public.patient_accessibility_profiles, public.patient_interface_preferences, public.patient_accessibility_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.patient_accessibility_profiles, public.patient_interface_preferences, public.patient_accessibility_history TO authenticated;
GRANT ALL ON TABLE public.patient_accessibility_profiles, public.patient_interface_preferences, public.patient_accessibility_history TO service_role;
REVOKE ALL ON SEQUENCE public.patient_accessibility_history_id_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON SEQUENCE public.patient_accessibility_history_id_seq TO service_role;
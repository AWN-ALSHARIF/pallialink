# Access+ — correct inherited table privileges

## Implemented and verified
The approved Phase 1 migration and interfaces are implemented. Real account checks verified scoped editing, patient self-service, persistence across refresh/fresh sign-in, history and metadata-only organization audit. All 35 automated tests passed, and the latest preview build is OK. Suggested patient scenarios remain unapplied; temporary test grants were revoked. Nothing was published.

## Finding
Effective database privileges include **anonymous SELECT and authenticated UPDATE** on the new tables despite the proposal's explicit authenticated SELECT grants. Existing/default privileges were not removed by adding narrower grants.

Current RLS has only authenticated scoped SELECT policies and no write policies. An attempted direct UPDATE changed no data; anonymous save execution is denied. Nevertheless, broader grants violate the intended least-privilege design, so security completion remains pending.

## Proposed correction — complete SQL
```sql
REVOKE ALL ON TABLE public.patient_accessibility_profiles, public.patient_interface_preferences, public.patient_accessibility_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.patient_accessibility_profiles, public.patient_interface_preferences, public.patient_accessibility_history TO authenticated;
GRANT ALL ON TABLE public.patient_accessibility_profiles, public.patient_interface_preferences, public.patient_accessibility_history TO service_role;
REVOKE ALL ON SEQUENCE public.patient_accessibility_history_id_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON SEQUENCE public.patient_accessibility_history_id_seq TO service_role;
```

Also attached as `pallialink-access-plus-grants-correction-proposed.sql`.

## Affected objects and compatibility
Only privileges on the three new Access+ tables and their history identity sequence change. No data, policies, accounts, care teams, clinical records or existing permission functions change. Checked save functions run as the owner after revalidating the caller, so authenticated table write rights are unnecessary. Patient/staff authorized reads retain SELECT. Service-role privileges remain.

Risk: unexpected code using direct writes would stop working; the implemented interfaces use only checked save functions. No destructive operation or history deletion. No publication or suggested demo configurations are authorized.

## After explicit approval
Apply this exact correction through the migration tool. Read back effective privileges for all three tables and sequence. Verify anonymous requests cannot read, direct authenticated writes are denied, and authorized UI saves/read-back still succeed. Document the final results and remaining physical-device/inactive-account/full-clinical-lifecycle testing limitations.
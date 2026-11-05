# PalliaLink — single-report text, images and audio

## Findings from the current implementation
- `/report` already sends written notes and an optional voice recording together in one report.
- The Access+ picture option opens a board of predefined symbols; it is not an uploaded-image attachment feature. Each board request currently submits a separate report.
- The live database has one legacy audio path on each report, but no report image collection. Both existing media buckets are private; clinical documents are staff-only and must not be reused for patient uploads.

## Approval boundary
No application screens, database records, permissions or deployment have been changed. Only this proposal, the task list and requirement memory were prepared.

Approval covers the complete SQL in the attached **pallialink-multimodal-proposed.sql** and creating one private `report-images` bucket through the Storage API. Proposed formats: JPEG, PNG, WebP; proposed per-image size limit: 10 MiB. There is no one-image or fixed attachment-count limit. Existing audio stays at its current 60-second/2-MiB limits. These are safety limits, not new clinical rules.

The SQL adds `report_attachments`, three checked helper/submission functions, and four narrowly scoped storage policies. It does not change existing users, care teams, report states, histories, clinical records, old RPCs or existing storage policies. It does not grant any new staff clinical privileges. New functions revoke public/anonymous execution. No reset, reseed, publication, or deletion of existing data is included.

## What will be added without replacing existing screens
1. Add multiple-image selection beside the existing report notes and voice controls. Show every image preview with individually accessible remove and replace actions. Adding files appends rather than overwrites; replacement retains the item's position. Preserve selection order.
2. Keep text, images and voice active simultaneously in the same draft. Provide optional audio-file selection alongside recording, subject to the existing audio formats/duration/size rules.
3. Let Access+ pictogram selections join the report draft instead of forcing one separate report per selected method. Preserve the existing immediate-request workflow as an option. Keep explicit patient-entered pain; never derive severity or diagnoses from media or symbols. Only nonclinical request selections transfer in memory, without offline storage.
4. Upload all chosen files, then submit one report with ordered image paths and the existing audio fields. Never submit a partial set silently. On failure retain the local draft and identify failed uploads; disable competing submission while busy.
5. Show original text, all ordered images and audio on existing patient/caregiver and staff report details. Authorized nurses and physicians see the same submitted media, with image opening and audio playback. Use short-lived signed URLs; no public media links or offline medical cache.

## Technical integration
- Extend `src/lib/store.ts` read-only report mirror to load authorized attachment rows and refresh after a checked write. Carry image fields through `patientReportProjection` without exposing staff notes/actor metadata.
- Add focused attachment picker/gallery modules and central Arabic/English strings. Preserve the existing report layout and Back/discard behavior; image/audio drafts also count as unsaved changes.
- New `submit_report_multimodal` calls the existing checked `submit_report` inside one database transaction, validating image ownership, patient prefix, stored MIME/size, existence and non-reuse. Rows retain explicit image positions; legacy audio is displayed once separately, not duplicated in the table.
- Read access follows existing `can_view_report` exactly. Pending uploads are readable/removable only by their uploader; linked images are immutable to ordinary users.
- Record structural integration rules in AGENTS.md during implementation; refresh generated database types through the platform, never hand-edit generated clients/types.

## Risks and compatibility
- Database atomicity cannot cover Storage API uploads; failed submissions can leave pending files. Best-effort cleanup must never delete referenced media. Existing audio orphan handling remains unchanged.
- Do not blindly retry a submission whose result is unknown; first reconcile the created report to avoid duplicates. Test this before completion.
- A file's declared MIME is not a malware scan. Limit to raster formats and verify actual decoding in the UI; no SVG/HTML. Unsupported HEIC needs a clear error, not silent acceptance.
- Unlimited image count still faces browser memory and request/storage capacity. Upload progressively with per-file feedback; do not promise unlimited infrastructure.
- This is an additive, one-shot tracked migration, not a standalone rerunnable SQL script. SQL rollback does not remove an API-created bucket. After real submissions, retain data and readers when reverting submission UI.
- Shared preview/live backend means new content could reach older published screens without image rendering. Finish and verify the preview first; coordinate publication separately with explicit approval. Do not declare live-device availability before publication.

## Verification after approval
- Five images; text plus images; text plus recorded audio; text plus images plus audio; selected audio file; append/remove/replace and ordering.
- One report ID per combined submission, complete attachment associations, successful read-back after refresh and fresh login; existing legacy reports/recordings still open.
- Nurse acknowledge → assign physician → physician acknowledge/review/close, with every image readable and audio playable while authorized. Verify unrelated physician, other patient and cross-org direct requests are denied.
- Failed upload creates no incomplete report; failed transaction creates no attachment rows; referenced images cannot be overwritten/deleted.
- Arabic RTL and English LTR: desktop, iPhone-size, Android-size, tablet, and PWA display mode. Report physical-device and installed-PWA checks as unverified if unavailable.
- Run focused existing/regression tests, new concrete media/permission tests and inspect current preview errors. Do not call this complete until persisted combined content is read back through authorized screens.

## Current status
Inspection only; none of the requested new media flows has been implemented or tested. Backend/storage changes await explicit approval of the attached complete SQL and this plan.

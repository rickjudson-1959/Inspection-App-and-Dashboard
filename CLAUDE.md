# Claude Code Instructions for Pipe-Up Pipeline Inspector Platform

## Standing Instructions

### Field Guide Sync Requirement
Any changes to the inspector's report (`src/InspectorReport.jsx`), activity blocks (`src/ActivityBlock.jsx`), or related form components (e.g., `TrackableItemsTracker.jsx`, `UnitPriceItemsLog.jsx`, quality field constants) **must** be reflected in the Pipe-Up Field Guide.

After making such changes:
1. Regenerate `pipe-up-field-guide-agent-kb.md` to reflect the new/modified fields
2. Re-upload it to the `field_guide` slot in the Technical Resource Library via the Admin Portal or programmatically
3. Re-index it via the `process-document` edge function (document ID may change on re-upload)

The field guide is the AI agent's knowledge base for inspector mentoring. If it falls out of sync, inspectors will get incorrect guidance.

**Check this at the start of every new session and after every conversation compression.**

## Key References
- **Project Manifests:** `src/PROJECT_MANIFEST.md` and `Project Manifest docs/Project_Manifest_v1.9_UPDATED.md`
- **Production URL:** https://app.pipe-up.ca
- **Deployment:** Vercel (auto-deploys on push to main)
- **Database:** Supabase (PostgreSQL + Auth + Edge Functions)
- **Field Guide DB record:** category `field_guide` in `project_documents` table (is_global: true)

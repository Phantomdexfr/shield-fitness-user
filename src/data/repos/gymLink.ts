// Facade for the UI (Phase 67): screens import the gym link from here, never from src/data/gym/* directly.
// Nothing here imports @supabase/supabase-js; that stays inside src/data/gym/supabaseRemote.ts (dynamic import).

export { connectToGym, signIn, changePassword, disconnect, unsyncedCount, syncNow, retryFailed, restoreStatus, runRestoreNow, chunkRestoreStatus, runChunkRestoreNow, type ConnectStep } from '../gym/link';
export { getLastVerdict } from '../gym/restore';
export { useConnection, istTime } from '../gym/useConnection';
export { useChip } from '../gym/syncState';
export { useGymData, markRead, submitRequest, refreshGymNow, type GymData } from '../gym/gymDataApi';
export { usePrograms, programActions, useProposals, proposeToGym, useUpload, uploadActions, type ProgramView } from '../gym/gymProgramsApi';

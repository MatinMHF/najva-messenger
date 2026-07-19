/**
 * Signal Protocol orchestrator.
 *
 * The real implementation now lives in `session.ts` (X3DH + Double Ratchet).
 * This module re-exports it for back-compat with any older imports.
 */
export * from './session';

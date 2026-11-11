/**
 * Package entry point.
 *
 *   import { migrateDirectory } from 'ethers-v5-to-v6';
 *   const result = migrateDirectory('./my-repo');
 *
 * The individual transforms and the per-file runAll() are re-exported too.
 */
export * from './transforms';
export { migrateDirectory } from './migrate-directory';
export type { MigrateOptions, MigrationResult, MigrationTodo } from './migrate-directory';

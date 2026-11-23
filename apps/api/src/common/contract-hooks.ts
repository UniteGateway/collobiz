/** Modules that need to act when a contract is fully signed (e.g. the Industry Club lists a licensed product) register here. */
export type ContractExecutedHook = (contractId: string) => Promise<void>;
const hooks: ContractExecutedHook[] = [];
export const onContractExecuted = (h: ContractExecutedHook) => { hooks.push(h); };
/** Called by the contracts module after the last signature; a failing hook is logged, never undoes the signature. */
export async function contractExecuted(contractId: string) {
  for (const h of hooks) { try { await h(contractId); } catch (e) { console.error('contract hook failed', contractId, e); } }
}

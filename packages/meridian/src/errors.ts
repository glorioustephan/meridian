export const UNCOMPILED_ERROR =
  'Meridian source must be compiled before execution. Run the Meridian compiler or CLI first.';

export function throwUncompiledError(): never {
  throw new Error(UNCOMPILED_ERROR);
}

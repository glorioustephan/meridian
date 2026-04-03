import type { DiagnosticCode, MeridianDiagnostic } from './ir.js';

export const DIAGNOSTIC_MESSAGES: Record<DiagnosticCode, string> = {
  M001: "Meridian component modules must have 'use client' as the first statement.",
  M002: 'Decorated inheritance is not supported. Do not extend a class that itself extends Component or Primitive.',
  M003: 'Unsupported decorator: "{name}". Only @state, @ref, @effect, @effect.layout, and @use are supported.',
  M004: 'ServerComponent is not supported in Meridian v1.',
  M005: '@raw is not supported in Meridian v1.',
  M006: 'Component class must define a render() method.',
  M007: 'Primitive class must define a resolve() method.',
  M008: 'Dynamic property access on "this" is not supported. Use direct field access only.',
};

export function makeDiagnostic(
  code: DiagnosticCode,
  severity: MeridianDiagnostic['severity'],
  file: string,
  line: number,
  column: number,
  substitutions: Record<string, string> = {},
): MeridianDiagnostic {
  let message = DIAGNOSTIC_MESSAGES[code] ?? code;
  for (const [key, value] of Object.entries(substitutions)) {
    message = message.replace(`{${key}}`, value);
  }
  return { code, severity, message, file, line, column };
}

import type { DiagnosticCode, MeridianDiagnostic } from './ir.js';

export const DIAGNOSTIC_MESSAGES: Record<DiagnosticCode, string> = {
  M001: "Meridian modules must have 'use client' as the first statement.",
  M002:
    'Decorated inheritance is not supported in v1. Meridian declarations must extend Component or Primitive directly.',
  M003:
    'Unsupported decorator: "{name}". Only @state, @ref, @effect, @effect.layout, and @use are supported.',
  M004: 'ServerComponent authoring is deferred in Meridian v1.',
  M005: '@raw is not supported in Meridian v1.',
  M006: 'Component classes must define a render() method.',
  M007: 'Primitive classes must define a resolve() method.',
  M008: 'Dynamic property access on "this" is not supported in reactive code.',
  M009: 'Exactly one Meridian declaration is allowed per source module in v1.',
  M010: 'Reactive private-field usage is not supported in Meridian v1.',
  M011:
    '@use requires a statically analyzable primitive reference imported into the module and an inline arrow-function args factory.',
  M012:
    'Unsupported state mutation form. Only direct assignments like `this.count = nextValue` are supported in v1.',
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

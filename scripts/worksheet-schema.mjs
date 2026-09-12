// Emit public field definitions only. No business data or credentials.
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
const code = buildSync({
  stdin: {
    contents: "export * from './lib/bulk'; export * from './lib/i18n';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
}).outputFiles[0].text;
const mod = { exports: {} };
new Function('require', 'module', 'exports', code)(
  createRequire(import.meta.url),
  mod,
  mod.exports,
);
const { bulkTasks, bulkFields, translate } = mod.exports;
process.stdout.write(
  JSON.stringify(
    Object.entries(bulkTasks).map(([kind, task]) => ({
      kind,
      label: task.label,
      vi: translate('vi', task.label),
      fields: bulkFields(kind).map((f) => ({
        ...f,
        vi: translate('vi', f.label),
      })),
    })),
  ),
);

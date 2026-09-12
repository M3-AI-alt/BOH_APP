import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { inflateRawSync } from 'node:zlib';

/** Validate actual decompressed lengths before the XLSX library allocates a workbook. */
export function checkXlsxArchive(bytes: Buffer) {
  if (bytes.length > 2_000_000 || bytes.length < 22)
    throw Error('Use an Excel file smaller than 2 MB.');
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      bytes.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
    ) {
      end = i;
      break;
    }
  if (end < 0) throw Error('Invalid Excel archive.');
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16),
    total = 0;
  if (
    !count ||
    count > 256 ||
    bytes.readUInt16LE(end + 4) !== 0 ||
    bytes.readUInt16LE(end + 6) !== 0
  )
    throw Error('Unsupported Excel archive.');
  const names = new Set<string>();
  const files: Record<string, Buffer> = {};
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50)
      throw Error('Invalid Excel directory.');
    const flags = bytes.readUInt16LE(offset + 8),
      method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20),
      size = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28),
      extra = bytes.readUInt16LE(offset + 30),
      comment = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const name = bytes
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString('utf8');
    if (
      names.has(name) ||
      /vbaProject|externalLinks|\.\.\//i.test(name) ||
      flags & 1 ||
      ![0, 8].includes(method)
    )
      throw Error(
        'Use an unencrypted template without macros or external links.',
      );
    names.add(name);
    total += size;
    if (
      total > 8_000_000 ||
      local + 30 > bytes.length ||
      bytes.readUInt32LE(local) !== 0x04034b50
    )
      throw Error('Excel file is too large or invalid.');
    if (bytes.readUInt16LE(local + 8) !== method)
      throw Error('Invalid compression method.');
    const start =
      local +
      30 +
      bytes.readUInt16LE(local + 26) +
      bytes.readUInt16LE(local + 28);
    if (
      start + compressed > offset &&
      start + compressed > bytes.readUInt32LE(end + 16)
    )
      throw Error('Invalid Excel entry.');
    const packed = bytes.subarray(start, start + compressed);
    const data =
      method === 8
        ? inflateRawSync(packed, { maxOutputLength: Math.max(1, size) })
        : packed;
    if (data.length !== size) throw Error('Invalid Excel entry length.');
    files[name] = data;
    if (name.startsWith('xl/worksheets/') && name.endsWith('.xml')) {
      const xml = data.toString('utf8');
      if (/<!DOCTYPE|<!ENTITY/i.test(xml))
        throw Error('Unsupported XML declarations.');
      if (
        [...xml.matchAll(/<(?:[\w.-]+:)?row\b[^>]*\br="(\d+)"/g)].some(
          (m) => Number(m[1]) > 1000,
        ) ||
        /<(?:[\w.-]+:)?c\b[^>]*\br="[A-Z]{3,}\d+"/.test(xml)
      )
        throw Error('Use the BOH template with up to 200 entry rows.');
    }
    offset += 46 + nameLength + extra + comment;
  }
  if (!names.has('xl/workbook.xml')) throw Error('Choose an .xlsx workbook.');
  return files;
}
export async function readWorksheet(base64: string) {
  if (base64.length > 2_700_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64))
    throw Error('Invalid Excel upload.');
  const bytes = Buffer.from(base64, 'base64');
  const files = checkXlsxArchive(bytes);
  // ExcelJS does not read valid namespace-prefixed SpreadsheetML from some exporters.
  // Normalize only the spreadsheet namespace in our bounded, already-validated input.
  const zip = new JSZip();
  for (const [name, data] of Object.entries(files)) {
    let value: string | Buffer = data;
    if (name.endsWith('.xml')) {
      const xml = data.toString('utf8');
      const ns = xml.match(
        /xmlns:([A-Za-z_][\w.-]*)="http:\/\/schemas.openxmlformats.org\/spreadsheetml\/2006\/main"/,
      );
      if (ns)
        value = xml
          .replace(new RegExp('<(/?)' + ns[1] + ':', 'g'), '<$1')
          .replace(
            ns[0],
            'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
          );
    }
    zip.file(name, value);
  }
  const normalized = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'STORE',
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(normalized as any, {
    ignoreNodes: ['tableParts', 'drawing', 'picture', 'extLst'],
  });
  const sheet = workbook.getWorksheet('Entry');
  if (!sheet)
    throw Error('Use the Entry worksheet in the downloaded BOH template.');
  if (sheet.rowCount > 201 || sheet.columnCount > 50)
    throw Error('Use up to 200 entry rows.');
  const rows: unknown[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values = Array.from({ length: sheet.columnCount }, (_, i) => {
      const cell = row.getCell(i + 1),
        value = cell.value;
      if (value === null || value === undefined) return '';
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      if (typeof value === 'object')
        throw Error(
          'Use plain values, not formulas or links, in the Entry worksheet.',
        );
      return value;
    });
    if (values.some((v) => v !== '')) rows.push(values);
  });
  // No spreadsheet escaping here: validation must see (and reject) formula-like input.
  return rows
    .map((row) =>
      row.map((v) => '"' + String(v).replaceAll('"', '""') + '"').join(','),
    )
    .join('\r\n');
}

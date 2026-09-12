// Run with the bundled artifact-tool runtime, using worksheet-schema.mjs on stdin.
import fs from 'node:fs/promises';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';
let input = '';
for await (const chunk of process.stdin) input += chunk;
const tasks = JSON.parse(input);
const output = process.argv[2];
if (!output) throw Error('Output directory required');
await fs.mkdir(output, { recursive: true });
const samples = {
  entryKey: 'EXAMPLE-001',
  title: 'Review monthly collections',
  reason: 'Example timetable change',
  birthDate: '2015-06-15',
  name: 'Example Student',
  label: '48 sessions',
  classId: 'BOH Dewey 1',
  studentId: 'Example Student',
  packageId: 'Copy package ID',
  absenceId: 'Copy absence ID',
  sessions: 48,
  price: 12000000,
  agreedFee: 12000000,
  amount: 12000000,
  gross: 8000000,
  deductions: 0,
  employerInsurance: 0,
  opening: 0,
  statementClosing: 0,
  account: 'Company BIDV',
  description: 'Example only',
  notes: 'Example only',
  month: '2026-10',
  color: '#0D3048',
  weekdays: '0,3',
  status: 'Draft',
  phone: '0900000000',
  parentEmail: 'example@example.com',
};
for (const task of tasks) {
  const w = Workbook.create();
  const entry = w.worksheets.add('Entry'),
    guide = w.worksheets.add('Guide');
  entry.showGridLines = false;
  guide.showGridLines = false;
  entry.tabColor = '#0D3048';
  guide.tabColor = '#7C1537';
  entry.getRangeByIndexes(0, 0, 1, task.fields.length).values = [
    task.fields.map((f) => f.key),
  ];
  const body = entry.getRangeByIndexes(0, 0, 101, task.fields.length);
  body.format.font = { name: 'Arial', size: 11, color: '#0D3048' };
  body.format.columnWidth = 24;
  body.format.rowHeight = 24;
  entry.getRangeByIndexes(0, 0, 1, task.fields.length).format = {
    fill: '#0D3048',
    font: { name: 'Arial', size: 11, bold: true, color: '#FFFFFF' },
    rowHeight: 36,
    wrapText: true,
  };
  let colNumber = task.fields.length,
    endColumn = '';
  while (colNumber) {
    colNumber--;
    endColumn = String.fromCharCode(65 + (colNumber % 26)) + endColumn;
    colNumber = Math.floor(colNumber / 26);
  }
  entry.tables.add('A1:' + endColumn + '101', true, 'EntryTable');
  entry.freezePanes.freezeRows(1);
  entry.freezePanes.freezeColumns(1);
  task.fields.forEach((f, i) => {
    const range = entry.getRangeByIndexes(1, i, 100, 1);
    range.setNumberFormat(
      f.type === 'number' ? '#,##0' : f.type === 'date' ? 'yyyy-mm-dd' : '@',
    );
    if (f.options)
      range.dataValidation = { rule: { type: 'list', values: f.options } };
    if (f.type === 'checkbox')
      range.dataValidation = {
        rule: { type: 'list', values: ['true', 'false'] },
      };
  });
  guide.getRange('A2').values = [['BOH — ' + task.label + ' / ' + task.vi]];
  guide.getRange('A2').format.font = {
    name: 'Arial',
    size: 15,
    bold: true,
    color: '#0D3048',
  };
  const notes = [
    'Fill Entry from row 2. Keep headers unchanged. Maximum 200 rows. / Điền Entry từ dòng 2, giữ tên cột, tối đa 200 dòng.',
    'Examples below are guidance only; they are not imported. / Các ví dụ dưới đây không được nhập.',
    'Each entryKey must be unique. Keep it unchanged when retrying. / Mỗi entryKey duy nhất; giữ nguyên khi thử lại.',
    'Use exact names or IDs from the reference download. / Dùng tên chính xác hoặc mã trong danh sách tham chiếu.',
    'Dates YYYY-MM-DD. Whole VND. No formulas. Blank optional cells use defaults. / Ngày YYYY-MM-DD, VND nguyên, không công thức.',
    'Imports add records, never overwrite. Payroll stays draft. / Chỉ thêm mới, không ghi đè. Lương cần duyệt riêng.',
  ];
  guide.getRange('A4').write(notes.map((n) => [n]));
  guide.getRange('A11:E11').values = [
    [
      'Column / Cột',
      'Field / Trường',
      'Required / Bắt buộc',
      'Format / Định dạng',
      'Example only / Ví dụ',
    ],
  ];
  guide.getRange('E12:E' + (11 + task.fields.length)).setNumberFormat('@');
  guide
    .getRange('A12')
    .write(
      task.fields.map((f) => [
        f.key,
        f.label.includes(' / ') ? f.label : f.label + ' / ' + (f.key === 'month' ? 'Tháng' : f.vi),
        f.required ? 'Yes / Có' : 'No / Không',
        f.options?.join(', ') ||
          (f.type === 'date'
            ? 'YYYY-MM-DD'
            : f.type === 'month'
              ? 'YYYY-MM'
              : f.type === 'checkbox'
                ? 'true / false'
                : f.type === 'weekdays'
                  ? '0=Monday, 6=Sunday'
                  : f.type === 'number'
                    ? 'Whole number / Số nguyên'
                    : 'Text / Văn bản'),
        f.key === 'name' && task.kind === 'payroll' ? 'Example Employee' : f.key === 'name' && task.kind === 'class' ? 'BOH Example Class' : f.key === 'status'
          ? f.options?.[0] || ''
          : (samples[f.key] ??
            (f.options?.[0] ||
              (f.type === 'date'
                ? '2026-10-01'
                : f.type === 'checkbox'
                  ? 'false'
                  : ''))),
      ]),
    );
  guide.getRange('A4:E' + (11 + task.fields.length)).format.font = {
    name: 'Arial',
    size: 11,
    color: '#0D3048',
  };
  guide.getRange('A4:E' + (11 + task.fields.length)).format.rowHeight = 30;
  guide.getRange('A11:E11').format = {
    fill: '#0D3048',
    font: { color: '#FFFFFF', bold: true },
    rowHeight: 32,
  };
  for (const [col, width] of [
    ['A', 25],
    ['B', 65],
    ['C', 20],
    ['D', 62],
    ['E', 26],
  ])
    guide.getRange(
      col + '11:' + col + (11 + task.fields.length),
    ).format.columnWidth = width;
  guide.getRange('B12:D' + (11 + task.fields.length)).format.wrapText = true;
  guide.getRange('A12:E' + (11 + task.fields.length)).format.rowHeight = 48;
  guide.freezePanes.freezeRows(11);
  w.recalculate();
  console.log(
    task.kind,
    (
      await w.inspect({
        kind: 'region',
        sheetId: 'Entry',
        range: 'A1:F2',
        maxChars: 350,
      })
    ).ndjson,
  );
  for (const [sheetName, range] of [
    ['Entry', 'A1:F6'],
    ['Guide', 'A11:E17'],
  ]) {
    const png = await w.render({ sheetName, range, scale: 1, format: 'png' });
    await fs.writeFile(
      output + '/' + task.kind + '-' + sheetName + '.png',
      new Uint8Array(await png.arrayBuffer()),
    );
  }
  await (
    await SpreadsheetFile.exportXlsx(w)
  ).save(output + '/BOH-' + task.kind + '.xlsx');
}

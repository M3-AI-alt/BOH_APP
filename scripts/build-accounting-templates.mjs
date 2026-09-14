// Use the bundled artifact-tool runtime. Pass public accounting worksheet schema on stdin.
// Authoring outputs go to the first directory; previews go to the second (optional).
import fs from 'node:fs/promises';
import path from 'node:path';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const schema = JSON.parse(input);
const outputDir = process.argv[2];
const previewDir = process.argv[3] || outputDir;
if (
  !outputDir ||
  !schema.columns ||
  !schema.journalColumns ||
  !schema.limits ||
  !schema.required ||
  !schema.kinds
)
  throw Error(
    'Output directory and public accounting worksheet schema are required.',
  );
await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const palette = {
  navy: '#0D3048',
  burgundy: '#7C1537',
  ink: '#183447',
  muted: '#63758A',
  line: '#DCE4EC',
  input: '#FFF9E9',
  blue: '#2359A8',
};
const formatVnd = '#,##0;(#,##0);0';
const exampleDate = new Date('2026-10-01T00:00:00.000Z');
const exampleDueDate = new Date('2026-10-10T00:00:00.000Z');
const fieldNotes = {
  entryKey: [
    'Mã nhập duy nhất, tối đa 120 ký tự. Giữ nguyên khi thử lại. Dùng chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới.',
    'Unique entry reference, up to 120 characters. Keep it when retrying. Use English letters, numbers, dots, hyphens or underscores.',
  ],
  date: [
    'Ngày chứng từ. Nhập ngày Excel hoặc YYYY-MM-DD.',
    'Document date. Enter an Excel date or YYYY-MM-DD.',
  ],
  amount: [
    'Số tiền VND nguyên. Không gõ ký hiệu tiền hoặc dấu phân cách.',
    'Whole VND amount. Do not type currency symbols or separators.',
  ],
  name: [
    'Tên người nộp, người nhận hoặc mô tả trên chứng từ gốc.',
    'Payer, recipient or description shown on the source evidence.',
  ],
  category: [
    'Nhóm chứng từ để rà soát, ví dụ: học phí, điện nước.',
    'Review category, for example tuition or utilities.',
  ],
  direction: [
    'Ghi chú chiều giao dịch, ví dụ: Thu hoặc Chi. Không tự tạo bút toán.',
    'Optional direction note, for example In or Out. This does not create a journal.',
  ],
  reference: [
    'Mã giao dịch hoặc số chứng từ gốc. Giữ số 0 ở đầu.',
    'Original transaction or document reference. Keep leading zeroes.',
  ],
  kind: [
    'Chọn bill = hóa đơn nhà cung cấp, payroll = bảng lương, refund = hoàn tiền, journal = bút toán.',
    'Choose bill = supplier bill, payroll = payroll draft, refund = refund request, journal = journal draft.',
  ],
  title: [
    'Tên ngắn để nhận biết chứng từ.',
    'A short title identifying the document.',
  ],
  counterparty: [
    'Tên nhà cung cấp, nhân viên hoặc bên liên quan.',
    'Supplier, employee or other counterparty name.',
  ],
  dueDate: [
    'Ngày đến hạn nếu có. Để trống khi chưa áp dụng.',
    'Due date if applicable. Leave blank when not applicable.',
  ],
  notes: [
    'Diễn giải và tài liệu tham chiếu. Không chứa mật khẩu.',
    'Description and supporting references. Do not include passwords.',
  ],
  account: [
    'Mã tài khoản nội bộ do kế toán xác nhận. Mã chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới, tối đa 30 ký tự.',
    'Account code confirmed by the accountant. Use letters, numbers, dots, hyphens or underscores, up to 30 characters.',
  ],
  debit: [
    'Số phát sinh Nợ bằng VND nguyên. Mỗi dòng chỉ có Nợ hoặc Có.',
    'Whole VND debit. Each line has either a debit or a credit.',
  ],
  credit: [
    'Số phát sinh Có bằng VND nguyên. Tổng Nợ phải bằng tổng Có.',
    'Whole VND credit. Total debits must equal total credits.',
  ],
  description: [
    'Diễn giải riêng của dòng bút toán, nếu cần.',
    'Optional description for this journal line.',
  ],
};
const widths = {
  entryKey: 27,
  date: 17,
  amount: 21,
  name: 35,
  category: 28,
  direction: 23,
  reference: 29,
  kind: 18,
  title: 38,
  counterparty: 34,
  dueDate: 17,
  notes: 48,
  account: 27,
  debit: 21,
  credit: 21,
  description: 52,
};

function lastColumn(count) {
  let text = '';
  for (; count > 0; count = Math.floor((count - 1) / 26))
    text = String.fromCharCode(65 + ((count - 1) % 26)) + text;
  return text;
}

function baseSheet(workbook, name, rows, cols) {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  const range = sheet.getRangeByIndexes(0, 0, rows, cols);
  range.format.font = { name: 'Arial', size: 11, color: palette.ink };
  range.format.rowHeight = 27;
  range.format.verticalAlignment = 'center';
  return sheet;
}

function header(sheet, row, columns) {
  const range = sheet.getRangeByIndexes(row - 1, 0, 1, columns.length);
  range.values = [columns];
  range.format = {
    fill: palette.navy,
    font: { name: 'Arial', size: 11, bold: true, color: '#FFFFFF' },
    rowHeight: 34,
    horizontalAlignment: 'center',
    verticalAlignment: 'center',
    wrapText: false,
  };
  columns.forEach((key, i) => {
    sheet.getRangeByIndexes(0, i, 1, 1).format.columnWidth = widths[key] || 28;
  });
}

function inputSheet(workbook, name, columns, rowCount, kind) {
  const sheet = baseSheet(workbook, name, rowCount + 1, columns.length);
  sheet.tabColor = name === 'Entry' ? palette.navy : '#416078';
  const table = sheet.tables.add(
    `A1:${lastColumn(columns.length)}${rowCount + 1}`,
    true,
    `${kind}${name}Input`,
  );
  table.showFilterButton = true;
  header(sheet, 1, columns);
  const body = sheet.getRangeByIndexes(1, 0, rowCount, columns.length);
  body.format.fill = palette.input;
  body.format.font = { name: 'Arial', size: 11, color: palette.blue };
  body.setNumberFormat('@');
  columns.forEach((key, i) => {
    const range = sheet.getRangeByIndexes(1, i, rowCount, 1);
    if (['amount', 'debit', 'credit'].includes(key)) {
      range.setNumberFormat(formatVnd);
      range.format.horizontalAlignment = 'right';
      range.dataValidation = {
        rule: {
          type: 'whole',
          operator: 'between',
          formula1: key === 'amount' && kind === 'source' ? -1e12 : 0,
          formula2: 1e12,
        },
      };
    }
    if (key === 'date' || key === 'dueDate')
      range.setNumberFormat('yyyy-mm-dd');
    if (key === 'kind')
      range.dataValidation = { rule: { type: 'list', values: schema.kinds } };
  });
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(1);
  return sheet;
}

function guide(workbook, kind) {
  const isSource = kind === 'source';
  const title = isSource
    ? 'BOH Import review / Rà soát dữ liệu nguồn'
    : 'BOH Accounting drafts / Chứng từ nháp';
  const sheet = baseSheet(workbook, 'Guide', 46, 3);
  sheet.tabColor = palette.burgundy;
  sheet.getRange('A1:A46').format.columnWidth = 22;
  sheet.getRange('B1:C46').format.columnWidth = 72;
  sheet.getRange('A2').values = [[title]];
  sheet.getRange('A2').format.font = {
    name: 'Arial',
    size: 16,
    bold: true,
    color: palette.navy,
  };
  sheet.getRange('A3:C3').format.borders = {
    bottom: { style: 'thin', color: palette.burgundy },
  };
  sheet.getRange('A4').values = [['Template v1 / Mẫu v1']];
  sheet.getRange('A4:C4').format.font = {
    name: 'Arial',
    size: 11,
    italic: true,
    color: palette.muted,
  };
  sheet.getRange('A6:C6').values = [['Step / Bước', 'Tiếng Việt', 'English']];
  sheet.getRange('A6:C6').format = {
    fill: palette.navy,
    font: { color: '#FFFFFF', bold: true },
    rowHeight: 32,
  };
  const rules = [
    [
      '1. Điền / Fill',
      `Điền Entry từ dòng 2. Tối đa ${schema.limits.entryRows} dòng. Ô vàng là nơi nhập. Giữ nguyên tên trang tính và tên cột.`,
      `Fill Entry from row 2. Up to ${schema.limits.entryRows} rows. Yellow cells are inputs. Keep sheet names and column headers unchanged.`,
    ],
    [
      '2. Kiểm tra / Check',
      'Xem Examples để hiểu cách điền. Không chép ví dụ nếu không phải dữ liệu thật. Trang Examples không được nhập vào ứng dụng.',
      'Use Examples to see how to fill the file. Do not copy examples as real records. The Examples sheet is never imported.',
    ],
    [
      '3. Số tiền / Amount',
      isSource
        ? 'Số tiền có thể âm hoặc dương theo chứng từ gốc. 0 là số tiền thật, không có nghĩa là chưa rõ.'
        : 'Số tiền không âm. Giữ riêng khoản phải trả và khoản đã trả. Lưu nháp không có nghĩa là đã thanh toán.',
      isSource
        ? 'Amounts may be negative or positive as shown by the source. Zero is a real amount, not an unknown amount.'
        : 'Amounts must be nonnegative. Keep obligations separate from paid amounts. Saving a draft does not mean it has been paid.',
    ],
    [
      '4. Thử lại / Retry',
      'Mỗi entryKey đại diện cho một chứng từ và phải duy nhất. Giữ nguyên mã khi nhập lại. Dữ liệu đã lưu không bị ghi đè.',
      'Each entryKey identifies one record and must be unique. Keep the same key when retrying. Saved records are not overwritten.',
    ],
    [
      '5. Nhập / Import',
      'Trong BOH, chọn đúng loại mẫu, tải tệp lên, xem lỗi từng dòng rồi xác nhận. Sửa dòng lỗi và nhập lại. Không dùng công thức trong ô nhập.',
      'In BOH, select the correct worksheet type, upload, review row errors and confirm. Correct failed rows and retry. Use plain inputs, not formulas.',
    ],
    [
      'Kết quả / Result',
      isSource
        ? 'Tệp này chỉ lưu chứng từ nguồn để đối chiếu. Không tạo khoản thu tiền, chi tiền hoặc số dư mới.'
        : 'Tệp này chỉ tạo chứng từ nháp. Duyệt, thanh toán và ghi sổ là các thao tác riêng, theo quyền được cấp.',
      isSource
        ? 'This file stores source evidence for review only. It does not create a cash receipt, payment or new balance.'
        : 'This file creates draft documents only. Approval, payment and posting are separate actions subject to permissions.',
    ],
  ];
  // Keep each bilingual row at exactly three cells.
  const cleanRules = rules.map((row) =>
    row.filter((cell) => cell !== undefined),
  );
  sheet.getRange('A7').write(cleanRules);
  sheet.getRange('B7:C12').format.wrapText = true;
  sheet.getRange('A7:C12').format.rowHeight = 65;
  sheet.getRange('A14:C14').values = [
    ['Column / Cột', 'Tiếng Việt', 'English'],
  ];
  sheet.getRange('A14:C14').format = {
    fill: palette.navy,
    font: { color: '#FFFFFF', bold: true },
    rowHeight: 32,
  };
  const columns = schema.columns[kind];
  const fieldRows = columns.map((key) => {
    const required = schema.required[kind].includes(key);
    const prefixVi = required ? 'Bắt buộc. ' : 'Không bắt buộc. ';
    const prefixEn = required ? 'Required. ' : 'Optional. ';
    return [key, prefixVi + fieldNotes[key][0], prefixEn + fieldNotes[key][1]];
  });
  sheet.getRange('A15').write(fieldRows);
  sheet.getRange(`B15:C${14 + columns.length}`).format.wrapText = true;
  sheet.getRange(`A15:C${14 + columns.length}`).format.rowHeight = 58;
  let last = 14 + columns.length;
  if (!isSource) {
    const top = last + 3;
    sheet.getRange(`A${top}:C${top}`).values = [
      ['JournalLines', 'Dòng bút toán', 'Journal lines'],
    ];
    sheet.getRange(`A${top}:C${top}`).format = {
      fill: palette.navy,
      font: { color: '#FFFFFF', bold: true },
      rowHeight: 32,
    };
    sheet.getRange(`A${top + 1}:C${top + 1}`).values = [
      [
        'Quy tắc / Rule',
        `Loại journal phải có 2–${schema.limits.linesPerJournal} dòng cân bằng, cùng entryKey với Entry. Tối đa ${schema.limits.journalRows} dòng trong tệp. Tổng Nợ = tổng Có = amount.`,
        `A journal needs 2–${schema.limits.linesPerJournal} balanced lines linked by the same entryKey. Up to ${schema.limits.journalRows} lines per file. Total debit = total credit = amount.`,
      ],
    ];
    sheet.getRange(`B${top + 1}:C${top + 1}`).format.wrapText = true;
    sheet.getRange(`A${top + 1}:C${top + 1}`).format.rowHeight = 72;
    sheet
      .getRange(`A${top + 2}`)
      .write(
        schema.journalColumns.map((key) => [
          key,
          fieldNotes[key][0],
          fieldNotes[key][1],
        ]),
      );
    last = top + 1 + schema.journalColumns.length;
    sheet.getRange(`B${top + 2}:C${last}`).format.wrapText = true;
    sheet.getRange(`A${top + 2}:C${last}`).format.rowHeight = 58;
  }
  return { sheet, last };
}

function examples(workbook, kind) {
  const columns = schema.columns[kind];
  const sheet = baseSheet(workbook, 'Examples', 23, columns.length);
  sheet.tabColor = '#A5B4C1';
  sheet.getRange('A2').values = [['Examples only / Ví dụ, không nhập vào BOH']];
  sheet.getRange('A2').format.font = {
    name: 'Arial',
    size: 16,
    color: palette.navy,
    bold: true,
  };
  sheet.getRange('A4').values = [
    ['Use your own records in Entry. / Điền dữ liệu thật vào Entry.'],
  ];
  header(sheet, 6, columns);
  const rows =
    kind === 'source'
      ? [
          {
            entryKey: 'EXAMPLE-SOURCE-001',
            date: exampleDate,
            amount: 5000000,
            name: 'Example payer / Người nộp mẫu',
            category: 'Tuition / Học phí',
            direction: 'In / Thu',
            reference: 'REF-00001234',
          },
          {
            entryKey: 'EXAMPLE-SOURCE-002',
            date: exampleDate,
            amount: -250000,
            name: 'Example supplier / NCC mẫu',
            category: 'Utilities / Điện nước',
            direction: 'Out / Chi',
            reference: 'REF-00001235',
          },
        ]
      : [
          {
            entryKey: 'EXAMPLE-BILL-001',
            kind: 'bill',
            date: exampleDate,
            title: 'Books / Sách',
            counterparty: 'Example supplier / NCC mẫu',
            amount: 300000,
            dueDate: exampleDueDate,
            notes: 'Draft only / Chỉ là nháp',
          },
          {
            entryKey: 'EXAMPLE-PAY-001',
            kind: 'payroll',
            date: exampleDate,
            title: 'Payroll / Bảng lương',
            counterparty: 'Example employee / Nhân viên mẫu',
            amount: 5000000,
            notes: 'Confirmed amount only / Số tiền đã kiểm tra',
          },
          {
            entryKey: 'EXAMPLE-REF-001',
            kind: 'refund',
            date: exampleDate,
            title: 'Refund review / Xét hoàn tiền',
            counterparty: 'Example payer / Người nộp mẫu',
            amount: 250000,
            notes: 'Not paid / Chưa thanh toán',
          },
          {
            entryKey: 'EXAMPLE-JRN-001',
            kind: 'journal',
            date: exampleDate,
            title: 'Journal example / Bút toán mẫu',
            amount: 300000,
            notes: 'See journal lines below / Xem dòng bên dưới',
          },
        ];
  // Apply text formatting before values so transaction references keep leading zeroes.
  columns.forEach((key, i) => {
    const range = sheet.getRangeByIndexes(6, i, rows.length, 1);
    range.setNumberFormat(
      key === 'date' || key === 'dueDate'
        ? 'yyyy-mm-dd'
        : key === 'amount'
          ? formatVnd
          : '@',
    );
  });
  sheet.getRangeByIndexes(6, 0, rows.length, columns.length).values = rows.map(
    (row) => columns.map((key) => row[key] ?? null),
  );
  sheet.getRangeByIndexes(6, 0, rows.length, columns.length).format.wrapText =
    true;
  sheet.getRangeByIndexes(6, 0, rows.length, columns.length).format.rowHeight =
    52;
  if (kind === 'source' && sheet.getRange('G7').values[0][0] !== 'REF-00001234')
    throw Error('Source reference must remain text.');
  if (kind === 'documents') {
    sheet.getRange('A12').values = [
      [
        'Illustrative account codes only. Use accountant-confirmed codes. / Mã ví dụ; dùng mã do kế toán xác nhận.',
      ],
    ];
    header(sheet, 14, schema.journalColumns);
    const lines = [
      {
        entryKey: 'EXAMPLE-JRN-001',
        account: 'EXAMPLE_DEBIT',
        debit: 300000,
        credit: 0,
        description: 'Example debit / Dòng Nợ mẫu',
      },
      {
        entryKey: 'EXAMPLE-JRN-001',
        account: 'EXAMPLE_CREDIT',
        debit: 0,
        credit: 300000,
        description: 'Example credit / Dòng Có mẫu',
      },
    ];
    sheet.getRangeByIndexes(14, 0, 2, schema.journalColumns.length).values =
      lines.map((row) => schema.journalColumns.map((key) => row[key]));
    sheet.getRange('A15:E16').format.rowHeight = 44;
    sheet.getRange('A15:B16').setNumberFormat('@');
    sheet.getRange('C15:D16').setNumberFormat(formatVnd);
    sheet.getRange('E15:E16').setNumberFormat('@');
    sheet.getRange('A18:B19').values = [
      ['Total debit / Tổng Nợ', null],
      ['Total credit / Tổng Có', null],
    ];
    sheet.getRange('B18:B19').formulas = [['=SUM(C15:C16)'], ['=SUM(D15:D16)']];
    sheet.getRange('B18:B19').setNumberFormat(formatVnd);
    sheet.getRange('A18:B19').format.font.bold = true;
    // Keep document headings readable; the lower journal example uses the same columns.
    columns.forEach((key, i) => {
      sheet.getRangeByIndexes(0, i, 1, 1).format.columnWidth = Math.max(
        widths[key] || 28,
        i === 4 ? 45 : 0,
      );
    });
    sheet.getRange('C14:D14').format.wrapText = true;
  }
  return { sheet, last: kind === 'source' ? 9 : 20 };
}

for (const kind of ['source', 'documents']) {
  const workbook = Workbook.create();
  const guideInfo = guide(workbook, kind);
  const entry = inputSheet(
    workbook,
    'Entry',
    schema.columns[kind],
    schema.limits.entryRows,
    kind,
  );
  if (kind === 'documents')
    inputSheet(
      workbook,
      'JournalLines',
      schema.journalColumns,
      schema.limits.journalRows,
      kind,
    );
  const exampleInfo = examples(workbook, kind);
  workbook.recalculate();
  for (const [name, columns, rowCount] of [
    ['Entry', schema.columns[kind], schema.limits.entryRows],
    ...(kind === 'documents'
      ? [['JournalLines', schema.journalColumns, schema.limits.journalRows]]
      : []),
  ]) {
    const sheet = workbook.worksheets.getItem(name);
    const values = sheet.getRangeByIndexes(
      1,
      0,
      rowCount,
      columns.length,
    ).values;
    if (
      values.some((row) =>
        row.some((cell) => cell !== null && cell !== undefined && cell !== ''),
      )
    )
      throw Error(`${kind} ${name} must have blank input rows.`);
    if (
      JSON.stringify(
        sheet.getRangeByIndexes(0, 0, 1, columns.length).values[0],
      ) !== JSON.stringify(columns)
    )
      throw Error('Template headers differ from the shared schema.');
  }
  console.log(
    kind,
    (
      await workbook.inspect({
        kind: 'table',
        range: `Entry!A1:${lastColumn(schema.columns[kind].length)}3`,
        include: 'values,formulas',
        tableMaxRows: 3,
        tableMaxCols: 10,
        maxChars: 1800,
      })
    ).ndjson,
  );
  if (kind === 'documents') {
    const totals = exampleInfo.sheet.getRange('B18:B19').values.flat();
    if (totals.some((total) => total !== 300000))
      throw Error('Journal example totals must balance at 300000 VND.');
  }
  console.log(
    kind,
    (
      await workbook.inspect({
        kind: 'match',
        searchTerm:
          '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',
        options: { useRegex: true, maxResults: 20 },
        summary: 'Template formula error scan',
        maxChars: 1000,
      })
    ).ndjson,
  );
  const previews = [
    ['Guide', 'A1:C12', 'guide-start'],
    ['Guide', `A14:C${guideInfo.last}`, 'guide-fields'],
    ['Entry', `A1:${lastColumn(schema.columns[kind].length)}7`, 'entry'],
    ...(kind === 'documents'
      ? [['JournalLines', 'A1:E7', 'journal-lines']]
      : []),
    [
      'Examples',
      `A1:${lastColumn(schema.columns[kind].length)}${exampleInfo.last}`,
      'examples',
    ],
  ];
  for (const [sheetName, range, suffix] of previews) {
    const png = await workbook.render({
      sheetName,
      range,
      scale: 1.25,
      format: 'png',
    });
    await fs.writeFile(
      path.join(previewDir, `BOH-accounting-${kind}-${suffix}.png`),
      new Uint8Array(await png.arrayBuffer()),
    );
  }
  const filename = `BOH-accounting-${kind}.xlsx`;
  await (
    await SpreadsheetFile.exportXlsx(workbook)
  ).save(path.join(outputDir, filename));
  console.log(
    JSON.stringify({
      file: path.join(outputDir, filename),
      sheets:
        kind === 'source'
          ? ['Guide', 'Entry', 'Examples']
          : ['Guide', 'Entry', 'JournalLines', 'Examples'],
      entryRows: schema.limits.entryRows,
    }),
  );
}

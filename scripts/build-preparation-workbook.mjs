// Run a copy of this builder in a private scratch directory linked ONLY to the
// bundled artifact-tool node_modules. Arguments: source.json repo output.xlsx.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHmac } from 'node:crypto';
import { Workbook, SpreadsheetFile } from '@oai/artifact-tool';
import JSZip from 'jszip';
const [sourcePath, repo, output] = process.argv.slice(2);
const {
  preparationModules: modules,
  preparationAreas: areas,
  prepColumns,
  buildPreparation,
} = await import(pathToFileURL(path.join(repo, 'lib/preparation-schema.mjs')));
const snapshot = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
const baseline = buildPreparation(snapshot);
const vars = Object.fromEntries(
  (await fs.readFile(path.join(repo, '.dev.vars'), 'utf8'))
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [
      l.slice(0, l.indexOf('=')),
      l.slice(l.indexOf('=') + 1).replace(/^(["'])(.*)\1$/, '$2'),
    ]),
);
const canonical = JSON.stringify(baseline);
const signature = createHmac('sha256', vars.SUPABASE_SECRET_KEY)
  .update('BOH preparation baseline v1\n' + canonical)
  .digest('hex');
const navy = '#0D3048',
  burgundy = '#8A2444',
  ink = '#22384A',
  yellow = '#FFF2CC',
  muted = '#EDF2F6';
const w = Workbook.create(),
  start = w.worksheets.add('Bắt đầu');
// Register referenced sheets before formulas; avoids unresolved-sheet warnings.
for (const m of modules) w.worksheets.add(m.sheet);
const specifications = [];
const col = (n) => {
  let s = '';
  for (n++; n; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
function style(s, range) {
  s.showGridLines = false;
  const r = s.getRange(range);
  r.format.font = { name: 'Arial', size: 11, color: ink };
  r.format.rowHeight = 28;
  r.format.columnWidth = 24;
  r.format.verticalAlignment = 'center';
}
function heading(s, title, note, last = 'H') {
  s.getRange('A2').values = [[title]];
  s.getRange('A2').format.font = {
    name: 'Arial',
    size: 16,
    bold: true,
    color: navy,
  };
  s.getRange('A3').values = [
    [
      '← Bắt đầu · Ô vàng: điền / sửa · Ô xám: giữ nguyên · * Bắt buộc khi thêm mới; dòng cũ chỉ điền phần cần bổ sung.',
    ],
  ];
  s.getRange('A4').values = [[note]];
  s.getRange('A5').values = [
    [
      'Nguồn: BOH, chụp ' +
        new Date(baseline.capturedAt).toLocaleString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
        }) +
        ' · Chưa xác nhận kế toán.',
    ],
  ];
  s.getRange('A5:' + last + '5').format.font = { size: 10, color: '#54687A' };
}
function header(s, range) {
  s.getRange(range).format = {
    fill: navy,
    font: { name: 'Arial', size: 11, bold: true, color: '#FFFFFF' },
    rowHeight: 55,
    wrapText: true,
  };
}
style(start, 'A1:E47');
start.tabColor = burgundy;
start.getRange('A2').values = [['BOH | Kế toán chuẩn bị dữ liệu']];
start.getRange('A2').format.font = {
  name: 'Arial',
  size: 16,
  bold: true,
  color: navy,
};
start.getRange('A4').values = [
  [
    '1. Chọn phần bên dưới. Kiểm tra dữ liệu xám; chỉ điền ô vàng còn thiếu hoặc cần sửa.',
  ],
];
start.getRange('A5').values = [
  [
    '2. Chọn “Chưa rõ / Cần kiểm tra” nếu chưa có căn cứ. Ô trống không phải 0 hoặc xóa.',
  ],
];
start.getRange('A6').values = [
  [
    '3. Gửi lại đúng tệp này cùng chứng từ. BOH xem trước đề nghị; chưa tự ghi sổ / chuyển tiền.',
  ],
];
start.getRange('A7').values = [
  [
    'Bảo mật: dữ liệu học sinh và lương. Chỉ gửi cho kế toán và quản lý; không dùng mẫu nhập thêm thông thường.',
  ],
];
start.getRange('A9:E9').values = [
  [
    'Phần công việc',
    'Mở bảng (bấm vào tên)',
    'Dòng có sẵn',
    'Đã đánh dấu',
    'Ghi chú',
  ],
];
header(start, 'A9:E9');
let navRow = 10;
const navLinks = [];
for (const [area, keys] of areas) {
  for (const [i, key] of keys.entries()) {
    const m = modules.find((m) => m.key === key),
      table = baseline.tables[key];
    const statusCol = col(1 + m.original.length);
    start.getRange(`A${navRow}:E${navRow}`).values = [
      [
        i === 0 ? area : '',
        m.sheet,
        table.existingCount,
        null,
        key === 'company'
          ? 'Gồm chính sách kế toán nội bộ'
          : m.area === 7
            ? 'Chỉ điền khi có phát sinh'
            : '',
      ],
    ];
    start.getRange(`D${navRow}`).formulas = [
      [
        `=COUNTIF('${m.sheet}'!${statusCol}7:${statusCol}${6 + table.rows.length},"?*")`,
      ],
    ];
    start.getRange(`B${navRow}`).format.font = { color: burgundy, bold: true };
    navLinks.push({ cell: 'B' + navRow, sheet: m.sheet });
    navRow++;
  }
}
start.getRange('A9:A' + (navRow - 1)).format.columnWidth = 30;
start.getRange('B9:B' + (navRow - 1)).format.columnWidth = 34;
start.getRange('C9:D' + (navRow - 1)).format.columnWidth = 17;
start.getRange('E9:E' + (navRow - 1)).format.columnWidth = 38;
start.getRange('A10:E' + (navRow - 1)).format.wrapText = true;
start.getRange('A10:E' + (navRow - 1)).format.rowHeight = 38;
start.getRange('A' + (navRow + 1)).values = [
  [
    'Không yêu cầu điền lại 7.001 dấu điểm danh. Chỉ xác nhận công việc nhân viên có chứng cứ.',
  ],
];
start.getRange('A' + (navRow + 2)).values = [
  ['Xem “Ví dụ” nếu cần. Mã dòng đã cấp sẵn; chọn tên kèm mã trong danh sách.'],
];
start.getRange('A' + (navRow + 3)).values = [
  [
    'Chống sửa nhầm: các ô nguồn được khóa. Bảo vệ trang tính không phải mã hóa bảo mật.',
  ],
];
specifications.push({
  name: 'Bắt đầu',
  editable: [],
  links: navLinks,
  lastRow: navRow + 3,
  lastCol: 'E',
});

// Reference names retain stable codes, including unused new-entry slots. The
// user may type the stable reference of a newly filled row rather than rename it.
const lists = w.worksheets.add('Danh sách chọn');
style(lists, 'A1:Z280');
const referenceRanges = {};
for (const [j, m] of modules.entries()) {
  const rows = baseline.tables[m.key].rows;
  lists.getRange(col(j) + '1').values = [[m.sheet]];
  lists.getRange(`${col(j)}2:${col(j)}${rows.length + 1}`).values = rows.map(
    (r) => [
      r.ref +
        ' | ' +
        (r.original.name ||
          r.original.label ||
          (r.existing ? 'Dữ liệu đã có' : 'Dòng mới — điền tại ' + m.sheet)),
    ],
  );
  const nameColumn = prepColumns(m).findIndex((f) => f.key === 'name');
  if (nameColumn >= 0)
    rows.forEach((r, i) => {
      if (!r.existing)
        lists.getRange(col(j) + (i + 2)).formulas = [
          [
            `="${r.ref} | "&IF('${m.sheet}'!${col(nameColumn)}${i + 7}<>"",'${m.sheet}'!${col(nameColumn)}${i + 7},"Dòng mới — điền tại ${m.sheet}")`,
          ],
        ];
    });
  referenceRanges[m.key] =
    `'Danh sách chọn'!$${col(j)}$2:$${col(j)}$${rows.length + 1}`;
}
const classesCol = col(modules.length);
lists.getRange(classesCol + '1').values = [['Lớp học']];
lists.getRange(
  classesCol + '2:' + classesCol + (baseline.classes.length + 1),
).values = baseline.classes.map((c) => [
  c.id + ' | ' + c.name + (c.archived ? ' (lưu trữ)' : ''),
]);
referenceRanges.classes = `'Danh sách chọn'!$${classesCol}$2:$${classesCol}$${baseline.classes.length + 1}`;

for (const [idx, m] of modules.entries()) {
  const s = w.worksheets.getItem(m.sheet),
    t = baseline.tables[m.key],
    fields = prepColumns(m),
    last = 6 + t.rows.length,
    lastCol = col(fields.length - 1);
  style(s, `A1:${lastCol}${last}`);
  s.tabColor = m.area <= 3 ? navy : m.area <= 6 ? burgundy : '#54687A';
  heading(s, m.sheet, m.help, lastCol);
  s.getRange(`A6:${lastCol}6`).values = [fields.map((f) => f.label)];
  header(s, `A6:${lastCol}6`);
  const values = t.rows.map((r) =>
    fields.map((f) =>
      f.key === '_ref'
        ? r.ref
        : f.key.startsWith('original.')
          ? (r.original[f.key.slice(9)] ?? null)
          : null,
    ),
  );
  // Serialize source dates as real Excel dates, leaving truly missing values blank.
  for (const row of values)
    fields.forEach((f, i) => {
      if (
        f.type === 'date' &&
        typeof row[i] === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(row[i])
      )
        row[i] = new Date(row[i] + 'T00:00:00Z');
    });
  s.getRange(`A7:${lastCol}${last}`).values = values;
  s.getRange(`A7:${col(m.original.length)}${last}`).format.fill = muted;
  const editStart = 1 + m.original.length;
  s.getRange(`${col(editStart)}7:${lastCol}${last}`).format.fill = yellow;
  s.getRange(`A6:A${last}`).format.columnWidth = 18;
  fields.forEach((f, j) => {
    const r = s.getRange(`${col(j)}7:${col(j)}${last}`);
    r.setNumberFormat(
      f.type === 'money' || f.type === 'number'
        ? '#,##0;[Red](#,##0);0'
        : f.type === 'decimal'
          ? '0.00'
          : f.type === 'date'
            ? 'dd/mm/yyyy'
            : '@',
    );
    if (j)
      r.format.columnWidth =
        f.key.includes('name') || f.key.includes('Name')
          ? 38
          : f.key === 'original.value'
            ? 48
            : f.type === 'date'
              ? 17
              : f.type === 'money'
                ? 22
                : f.key === 'reason' || f.key === 'evidence'
                  ? 38
                  : f.type === 'reference'
                    ? 40
                    : 28;
    if (f.choices)
      r.dataValidation = { rule: { type: 'list', values: f.choices } };
    if (f.reference)
      r.dataValidation = {
        rule: { type: 'list', formula1: referenceRanges[f.reference] },
      };
    if (['number', 'money'].includes(f.type) && !f.key.startsWith('original.'))
      r.dataValidation = {
        rule: {
          type: 'whole',
          operator: 'between',
          formula1: f.key === 'adjustment' ? -1e12 : 0,
          formula2: 1e12,
        },
      };
  });
  s.getRange(`B7:${lastCol}${last}`).format.wrapText = true;
  s.getRange(`A7:${lastCol}${last}`).format.rowHeight =
    m.kind === 'expense' || m.kind === 'commitment' ? 66 : 48;
  const st = col(editStart);
  s.getRange(`${st}7:${st}${last}`).conditionalFormats.addCustom(
    `=OR(${st}7="Cần kiểm tra",${st}7="Chưa rõ")`,
    { fill: '#FBE4DC', font: { color: '#852A2A' } },
  );
  s.freezePanes.freezeRows(6);
  s.freezePanes.freezeColumns(2);
  // Auto filters with locked original cells, no implicit record mutation.
  s.tables.add(`A6:${lastCol}${last}`, true, 'Prep' + idx);
  specifications.push({
    name: m.sheet,
    editable: [
      { fromCol: editStart, toCol: fields.length - 1, fromRow: 7, toRow: last },
    ],
    links: [{ cell: 'A3', sheet: 'Bắt đầu' }],
    lastRow: last,
    lastCol,
  });
}
const ex = w.worksheets.add('Ví dụ');
style(ex, 'A1:F17');
heading(
  ex,
  'Ví dụ — không được nhập vào BOH',
  'Các giá trị dưới đây là minh họa, không phải giao dịch hoặc thông tin đã xác minh.',
  'F',
);
ex.getRange('A7:F7').values = [
  [
    'Tình huống',
    'Bảng cần điền',
    'Mã dòng',
    'Điền ô vàng',
    'Trạng thái',
    'Cách xử lý',
  ],
];
header(ex, 'A7:F7');
ex.getRange('A8:F13').values = [
  [
    'Thông tin cũ đúng',
    'Thu tiền',
    'Giữ mã dòng cũ',
    'Để trống các ô số tiền / ngày sửa',
    'Đúng, giữ nguyên',
    'Không tạo giao dịch mới',
  ],
  [
    'Số tiền cũ sai',
    'Thu tiền',
    'Giữ mã dòng cũ',
    'Điền số tiền đúng + lý do + mã sao kê',
    'Bổ sung / đề nghị sửa',
    'Đề nghị sửa để quản lý xem xét',
  ],
  [
    'Thu một lần cho hai anh em',
    'Phân bổ',
    'Hai mã dòng mới',
    'Cùng mã thu; mỗi dòng một học sinh, một số tiền',
    'Bổ sung / đề nghị sửa',
    'Phân bổ không tạo thêm tiền thu',
  ],
  [
    'Chưa có mức đóng bảo hiểm',
    'Công ty',
    'Dòng cấu hình bảo hiểm',
    'Ghi giấy tờ cần kiểm tra, không ghi 0',
    'Chưa rõ',
    'Không tự tính thuế / bảo hiểm',
  ],
  [
    'Hóa đơn đã trả từ trước',
    'Hóa đơn nhà cung cấp',
    'Mã dòng mới',
    'Số đã trả và mã Chi phí đã có',
    'Bổ sung / đề nghị sửa',
    'Không ghi lại chi phí / tiền chi',
  ],
  [
    'Một học sinh đã dừng',
    'Học sinh',
    'Giữ mã học sinh cũ',
    'Chọn Đã dừng + ngày hiệu lực + lý do',
    'Bổ sung / đề nghị sửa',
    'Giữ lịch sử, không xóa học sinh',
  ],
];
ex.getRange('A8:F13').format.wrapText = true;
ex.getRange('A8:F13').format.rowHeight = 82;
ex.getRange('A7:F13').format.columnWidth = 30;
specifications.push({
  name: 'Ví dụ',
  editable: [],
  links: [{ cell: 'A3', sheet: 'Bắt đầu' }],
  lastRow: 13,
  lastCol: 'F',
});

const control = w.worksheets.add('Nguồn và phạm vi');
style(control, 'A1:D24');
control.getRange('A2').values = [['Nguồn và phạm vi dữ liệu']];
control.getRange('A2').format.font = { size: 16, bold: true, color: navy };
control.getRange('A4').values = [
  [
    'Dữ liệu vận hành BOH: ' +
      baseline.capturedAt +
      ' (UTC). Không phải bản xác nhận sổ kế toán.',
  ],
];
control.getRange('A6:D6').values = [
  ['Nguồn / chỉ tiêu', 'Giá trị (VND)', 'Căn cứ', 'Trạng thái'],
];
header(control, 'A6:D6');
control.getRange('A7:D13').values = [
  [
    'Thu tháng 8/2026',
    baseline.controlTotals.augustCollections,
    'Tổng phiếu thu BOH tháng 8',
    'Khớp mốc đối chiếu 200.295.000',
  ],
  ...baseline.controlTotals.januaryToMayExpenses.map((v, i) => [
    'Chi tháng ' + (i + 1) + '/2026',
    v,
    'Giữ nguyên tất cả dòng chi nguồn',
    'Cần kế toán đối chiếu sao kê',
  ]),
  [
    'Sao kê / bảng tính khác',
    null,
    'Chưa thu thập thêm trong tệp này',
    'Không được coi là đầy đủ',
  ],
];
control.getRange('A15').values = [
  [
    '37 ảnh trang công cụ + 4 ảnh menu: chỉ tham khảo cách tổ chức biểu mẫu, không phải dữ liệu tài chính.',
  ],
];
control.getRange('A17').values = [
  [
    'Các trạng thái kiểm tra chỉ là ý kiến kế toán; không phải phê duyệt, ghi sổ, ký hóa đơn hay nộp thuế.',
  ],
];
control.getRange('A19').values = [
  [
    'Tệp này chưa chứa chứng từ đính kèm. Chức năng còn thiếu được giữ trong khu vực xem xét riêng.',
  ],
];
control.getRange('A6:A13').format.columnWidth = 30;
control.getRange('B6:B13').format.columnWidth = 25;
control.getRange('C6:D13').format.columnWidth = 44;
control.getRange('A7:D13').format.rowHeight = 46;
control.getRange('A7:D13').format.wrapText = true;
control.getRange('B7:B12').setNumberFormat('#,##0');
specifications.push({
  name: 'Nguồn và phạm vi',
  editable: [],
  links: [],
  lastRow: 19,
  lastCol: 'D',
});

const meta = w.worksheets.add('_BOH_PREP');
meta.getRange('A1:B3').values = [
  ['version', baseline.version],
  ['signature', signature],
  ['chunkCount', Math.ceil(canonical.length / 16000)],
];
for (let i = 0; i < canonical.length; i += 16000)
  meta.getRange('A' + (4 + i / 16000)).values = [
    [canonical.slice(i, i + 16000)],
  ];
// Artifact-tool has no documented protection/visibility/hyperlink surface.
// It authors all data, styles, formulas and validation. Add only those three
// missing native XLSX features directly to the exported OOXML below.
w.recalculate();
console.log(
  (
    await w.inspect({
      kind: 'match',
      searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!',
      options: { useRegex: true, maxResults: 50 },
      maxChars: 1500,
    })
  ).ndjson,
);
await fs.mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
await (await SpreadsheetFile.exportXlsx(w)).save(output);
// Keep artifact-tool diagnostic sidecars private and out of the handover folder.
try {
  await fs.rename(
    output + '.inspect.ndjson',
    path.join(path.dirname(sourcePath), 'workbook.inspect.ndjson'),
  );
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
const zip = await JSZip.loadAsync(await fs.readFile(output));
let styles = await zip.file('xl/styles.xml').async('string');
const xfMatch = styles.match(/<((?:\w+:)?cellXfs)\b[^>]*>([\s\S]*?)<\/\1>/);
if (!xfMatch) throw Error('XLSX styles missing');
const xfs = xfMatch[2].match(
  /<(?:\w+:)?xf\b[^>]*(?:\/>|>[\s\S]*?<\/(?:\w+:)?xf>)/g,
);
const prefix = xfMatch[1].includes(':') ? xfMatch[1].split(':')[0] + ':' : '';
const clones = xfs.map((x) =>
  x
    .replace(/\sapplyProtection="[^"]*"/g, '')
    .replace(/<(?:\w+:)?protection\b[^>]*\/>/g, '')
    .replace(/\/>$/, `><${prefix}protection locked="0"/></${prefix}xf>`)
    .replace(
      new RegExp(`</${prefix}xf>$`),
      `<${prefix}protection locked="0"/></${prefix}xf>`,
    ),
);
// Remove the duplicate protection generated by the self-closing conversion.
const unlocked = clones.map((x) =>
  x.replace(new RegExp(`(<${prefix}protection locked="0"/>){2}`), '$1'),
);
styles = styles.replace(
  xfMatch[0],
  `<${xfMatch[1]} count="${xfs.length * 2}">${xfMatch[2]}${unlocked.join('')}</${xfMatch[1]}>`,
);
zip.file('xl/styles.xml', styles);
let workbookXml = await zip.file('xl/workbook.xml').async('string');
const sheets = [
  ...workbookXml.matchAll(
    /<(?:\w+:)?sheet\b[^>]*name="([^"]+)"[^>]*sheetId="(\d+)"[^>]*\/?\s*>/g,
  ),
];
const xmlEscape = (s) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
for (const m of sheets) {
  const name = m[1].replaceAll('&amp;', '&'),
    index = Number(m[2]);
  const f = 'xl/worksheets/sheet' + index + '.xml';
  let xml = await zip.file(f).async('string');
  const ns = (xml.match(/<([\w]+):worksheet/) || [])[1];
  const p = ns ? ns + ':' : '';
  if (['_BOH_PREP', 'Danh sách chọn'].includes(name)) {
    workbookXml = workbookXml.replace(
      m[0],
      m[0]
        .replace(/\sstate="[^"]*"/, '')
        .replace(/\/?\s*>$/, ' state="veryHidden"/>'),
    );
    continue;
  }
  const spec = specifications.find((s) => s.name === name);
  if (!spec) throw Error('Missing sheet specification: ' + name);
  xml = xml.replace(
    /<((?:\w+:)?c)\b([^>]*\br="([A-Z]+)(\d+)"[^>]*)>/g,
    (whole, tag, attrs, letters, row) => {
      const c =
        [...letters].reduce((a, x) => a * 26 + x.charCodeAt(0) - 64, 0) - 1;
      if (
        !spec.editable.some(
          (e) =>
            c >= e.fromCol &&
            c <= e.toCol &&
            Number(row) >= e.fromRow &&
            Number(row) <= e.toRow,
        )
      )
        return whole;
      const style =
        Number((attrs.match(/\bs="(\d+)"/) || [])[1] || 0) + xfs.length;
      const selfClosing = /\/$/.test(attrs);
      return (
        '<' +
        tag +
        attrs.replace(/\ss="\d+"/, '').replace(/\/$/, '') +
        ' s="' +
        style +
        '"' +
        (selfClosing ? '/' : '') +
        '>'
      );
    },
  );
  xml = xml.replace(
    `</${p}sheetData>`,
    `</${p}sheetData><${p}sheetProtection sheet="1" objects="1" scenarios="1" selectLockedCells="0" selectUnlockedCells="0" autoFilter="0"/>`,
  );
  if (spec.links.length) {
    const links =
      `<${p}hyperlinks>` +
      spec.links
        .map(
          (l) =>
            `<${p}hyperlink ref="${l.cell}" location="'${xmlEscape(l.sheet)}'!A1"/>`,
        )
        .join('') +
      `</${p}hyperlinks>`;
    // Hyperlinks must precede page margins / setup and drawing/table nodes.
    const anchor = new RegExp(
      `<${p}(printOptions|pageMargins|pageSetup|headerFooter|drawing|tableParts)\\b`,
    );
    const at = xml.search(anchor);
    xml =
      at >= 0
        ? xml.slice(0, at) + links + xml.slice(at)
        : xml.replace(`</${p}worksheet>`, links + `</${p}worksheet>`);
  }
  zip.file(f, xml);
}
zip.file('xl/workbook.xml', workbookXml);
await fs.writeFile(
  output,
  await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
  { mode: 0o600 },
);
await fs.chmod(output, 0o600);
const previewDir = path.join(path.dirname(sourcePath), 'previews');
await fs.mkdir(previewDir, { recursive: true, mode: 0o700 });
for (const spec of specifications) {
  const range =
    spec.name === 'Bắt đầu'
      ? 'A9:E21'
      : spec.name === 'Ví dụ'
        ? 'A7:F13'
        : spec.name === 'Nguồn và phạm vi'
          ? 'A6:D13'
          : `A6:${spec.lastCol}9`;
  const png = await w.render({
    sheetName: spec.name,
    range,
    scale: spec.editable.length ? 0.65 : 1,
    format: 'png',
  });
  await fs.writeFile(
    path.join(previewDir, spec.name + '.png'),
    new Uint8Array(await png.arrayBuffer()),
  );
}
const introduction = await w.render({
  sheetName: 'Bắt đầu',
  range: 'A1:E8',
  scale: 1,
  format: 'png',
});
await fs.writeFile(
  path.join(previewDir, 'Bắt đầu - hướng dẫn.png'),
  new Uint8Array(await introduction.arrayBuffer()),
);
console.log(
  JSON.stringify({
    output,
    sheets: specifications.length,
    sourceRows: Object.values(baseline.tables).reduce(
      (s, t) => s + t.existingCount,
      0,
    ),
    sourceDate: baseline.capturedAt,
    bytes: (await fs.stat(output)).size,
  }),
);

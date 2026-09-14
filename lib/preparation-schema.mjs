// Shared intake definitions. These describe proposals, never posting commands.
export const preparationVersion = 'BOH-PREP-1';
export const reviewChoices = [
  'Đúng, giữ nguyên',
  'Bổ sung / đề nghị sửa',
  'Chưa rõ',
  'Cần kiểm tra',
  'Không áp dụng',
];
const field = (key, label, type = 'text', choices) => ({
  key,
  label,
  type,
  ...(choices ? { choices } : {}),
});
const text = (key, label) => field(key, label);
const money = (key, label) => field(key, label + ' (VND)', 'money');
const date = (key, label) => field(key, label, 'date');
const choice = (key, label, choices) => field(key, label, 'choice', choices);
const ref = (key, label, reference) => ({
  ...field(key, label, 'reference'),
  reference,
});
const company = ['Company BIDV', 'Company VCB'];
const period = () => field('month', 'Kỳ (YYYY-MM)', 'month');
const amount = money('amount', 'Số tiền');
const sourceName = text('name', 'Tên / nội dung hiện có');
const sourceDate = date('date', 'Ngày hiện có');
const sourceAmount = money('amount', 'Số tiền hiện có');
const sourceAccount = text('account', 'Tài khoản nguồn lịch sử');
const evidence = text('evidence', 'Mã tệp / chứng từ');
const module = (
  key,
  sheet,
  area,
  kind,
  original,
  inputs,
  help,
  blank = 20,
) => ({ key, sheet, area, kind, original, inputs, help, blank });
export const preparationModules = [
  module(
    'company',
    'Công ty',
    1,
    null,
    [text('name', 'Thông tin cần xác nhận'), text('value', 'Giá trị đã biết')],
    [text('value', 'Bổ sung / giá trị đúng')],
    'Xác nhận pháp nhân và cấu hình. Chưa rõ: chọn trạng thái, không đoán thuế hoặc tỷ lệ.',
    0,
  ),
  module(
    'accounts',
    'Tài khoản',
    1,
    null,
    [sourceName],
    [
      text('name', 'Tên tài khoản công ty'),
      text('holder', 'Chủ tài khoản'),
      text('bank', 'Ngân hàng'),
      text('number', 'Số tài khoản (dạng chữ)'),
      choice('type', 'Loại', ['Ngân hàng công ty', 'Quỹ tiền mặt']),
      date('effectiveFrom', 'Hiệu lực từ'),
    ],
    'Hai tên tài khoản là lựa chọn của BOH, không phải xác nhận số tài khoản. Chỉ tài khoản công ty; người nhận cá nhân ghi tại NCC / chi phí.',
    8,
  ),
  module(
    'students',
    'Học sinh',
    2,
    'student',
    [
      sourceName,
      text('className', 'Lớp hiện có'),
      text('status', 'Trạng thái hiện có'),
      text('parent', 'Liên hệ nguồn'),
    ],
    [
      ref('familyRef', 'Gia đình (chọn mã tên)', 'families'),
      text('parent', 'Tên phụ huynh đúng'),
      text('phone', 'Điện thoại đúng'),
      choice('status', 'Trạng thái đề nghị', [
        'Đang học',
        'Tạm nghỉ',
        'Đã dừng',
        'Cần kiểm tra',
      ]),
      date('effectiveDate', 'Ngày hiệu lực thay đổi'),
    ],
    'Giữ nguyên học sinh cũ. Học sinh đã dừng không bị xóa lịch sử. Liên kết gia đình chỉ khi đã xác nhận.',
    20,
  ),
  module(
    'families',
    'Gia đình',
    2,
    null,
    [],
    [
      text('name', 'Tên gia đình / người trả'),
      text('guardian', 'Họ tên người giám hộ'),
      text('relationship', 'Quan hệ với học sinh'),
      text('phone', 'Điện thoại'),
      text('email', 'Email'),
      text('secondGuardian', 'Người liên hệ thứ hai'),
      text('secondPhone', 'Điện thoại thứ hai'),
    ],
    'Một dòng mỗi gia đình. Dùng mã dòng gia đình tại Học sinh và Phân bổ; không tự gộp người trùng tên.',
    35,
  ),
  module(
    'catalogue',
    'Gói học - danh mục',
    2,
    'catalogue',
    [
      text('name', 'Tên gói hiện có'),
      field('sessions', 'Số buổi hiện có', 'number'),
      money('amount', 'Giá hiện có'),
    ],
    [
      text('name', 'Tên gói mới / đúng'),
      field('sessions', 'Số buổi đề nghị', 'number'),
      money('price', 'Giá đề nghị'),
      date('effectiveFrom', 'Áp dụng từ'),
      choice('active', 'Đang bán', ['Có', 'Không', 'Chưa rõ']),
    ],
    'Giá hiện có được giữ nguyên. Giá mới chỉ là đề nghị, không đổi hợp đồng đã mua. Buổi học không phải số lượng tồn kho.',
    10,
  ),
  module(
    'agreements',
    'Thỏa thuận học phí',
    2,
    'package',
    [
      sourceName,
      text('label', 'Gói đã mua'),
      field('sessions', 'Số buổi đã mua', 'number'),
      sourceAmount,
      date('date', 'Bắt đầu nguồn'),
    ],
    [
      ref('studentRef', 'Học sinh (dòng mới)', 'students'),
      money('agreedFee', 'Học phí thỏa thuận đúng'),
      field('sessions', 'Số buổi đúng', 'number'),
      date('startDate', 'Ngày bắt đầu đúng'),
      date('dueDate', 'Hạn thanh toán'),
      choice('scope', 'Phạm vi', ['Tất cả lớp phù hợp', 'Một lớp']),
      ref('classRef', 'Lớp giới hạn', 'classes'),
    ],
    'Số tiền là giá thỏa thuận, không phải tiền đã thu hay dư nợ. Ô trống giữ nguyên. Gói gia hạn chưa thỏa thuận không tạo nợ.',
    20,
  ),
  module(
    'installments',
    'Lịch học phí',
    2,
    null,
    [],
    [
      ref('agreementRef', 'Thỏa thuận học phí', 'agreements'),
      date('dueDate', 'Ngày đến hạn'),
      amount,
      text('description', 'Nội dung khoản đến hạn'),
    ],
    'Một dòng mỗi kỳ thanh toán đã thỏa thuận. Đây là lịch của thỏa thuận, không tạo khoản nợ thứ hai.',
    30,
  ),
  module(
    'receipts',
    'Thu tiền',
    3,
    'receipt',
    [sourceName, sourceDate, sourceAmount, sourceAccount],
    [
      date('date', 'Ngày thu đúng / mới'),
      text('name', 'Người trả đúng / mới'),
      amount,
      choice('account', 'Tài khoản nhận mới', company),
      text('reference', 'Mã giao dịch ngân hàng'),
      ref('familyRef', 'Gia đình người trả', 'families'),
    ],
    'Mỗi lần thực nhận ghi đúng một dòng. Tài khoản cá nhân lịch sử chỉ là chứng cứ. Sửa dòng cũ cần lý do; không ghi lại khoản đã có.',
    25,
  ),
  module(
    'allocations',
    'Phân bổ',
    3,
    null,
    [sourceName, sourceAmount],
    [
      ref('receiptRef', 'Khoản thu', 'receipts'),
      ref('studentRef', 'Học sinh', 'students'),
      ref('agreementRef', 'Thỏa thuận học phí', 'agreements'),
      amount,
      date('effectiveDate', 'Ngày phân bổ'),
      choice('purpose', 'Mục đích', [
        'Học phí',
        'Đặt cọc',
        'Sách / tài liệu',
        'Tín dụng chưa phân bổ',
        'Cần kiểm tra',
      ]),
    ],
    'Một dòng phân bổ của một khoản thu. Anh chị em dùng cùng mã khoản thu. Tổng phân bổ không được vượt tiền đã nhận; không tạo tiền thu mới.',
    50,
  ),
  module(
    'suppliers',
    'Nhà cung cấp',
    4,
    null,
    [],
    [
      text('name', 'Nhà cung cấp / dịch vụ'),
      text('taxCode', 'Mã số thuế'),
      text('contact', 'Người liên hệ'),
      text('phone', 'Điện thoại'),
      text('terms', 'Điều khoản thanh toán'),
      text('recipientName', 'Tên người nhận tiền'),
      text('recipientBank', 'Ngân hàng người nhận'),
      text('recipientAccount', 'Số tài khoản người nhận'),
    ],
    'Người nhận có thể là cá nhân. Đây không phải tài khoản nguồn của công ty. Không điền mật khẩu / mã OTP.',
    25,
  ),
  module(
    'bills',
    'Hóa đơn nhà cung cấp',
    4,
    null,
    [],
    [
      ref('supplierRef', 'Nhà cung cấp', 'suppliers'),
      text('number', 'Số hóa đơn / chứng từ'),
      date('date', 'Ngày hóa đơn'),
      date('dueDate', 'Hạn trả'),
      amount,
      text('description', 'Nội dung hàng / dịch vụ'),
      money('paidToDate', 'Đã trả tại ngày đối chiếu'),
      text('paymentRefs', 'Mã chi tiền đã ghi'),
    ],
    'Một dòng mỗi nghĩa vụ phải trả. Đã trả phải có mã chi tiền / chứng cứ. Hóa đơn không chứng minh đã thanh toán.',
    30,
  ),
  module(
    'expenses',
    'Chi phí',
    4,
    'expense',
    [sourceName, sourceDate, sourceAmount, sourceAccount],
    [
      ref('supplierRef', 'Nhà cung cấp', 'suppliers'),
      date('date', 'Ngày chi đúng / mới'),
      amount,
      choice('account', 'Tài khoản chi mới', company),
      text('recipientName', 'Tên người nhận'),
      text('recipientBank', 'Ngân hàng người nhận'),
      text('recipientAccount', 'Số tài khoản người nhận'),
      text('billRef', 'Mã hóa đơn đã có'),
    ],
    'Giữ tất cả chi phí lịch sử, kể cả tháng 1–5. Thanh toán hóa đơn / lương phải liên kết, không ghi thêm chi phí trùng.',
    25,
  ),
  module(
    'commitments',
    'Chi định kỳ',
    4,
    'commitment',
    [sourceName, sourceAmount, text('frequency', 'Chu kỳ nguồn')],
    [
      ref('supplierRef', 'Nhà cung cấp', 'suppliers'),
      amount,
      choice('frequency', 'Chu kỳ xác nhận', [
        'Hàng tháng',
        'Hàng quý',
        'Hàng năm',
        'Một lần',
        'Chưa rõ',
      ]),
      date('nextDue', 'Ngày đến hạn tiếp'),
      date('endDate', 'Kết thúc nếu có'),
    ],
    'Lịch chỉ tạo nhắc việc / bản nháp sau khi được duyệt; không tự chuyển tiền hoặc ghi chi phí.',
    15,
  ),
  module(
    'employees',
    'Nhân viên',
    5,
    null,
    [sourceName, text('position', 'Chức danh từ bảng lương')],
    [
      text('name', 'Họ tên đầy đủ đúng'),
      text('position', 'Chức danh đúng'),
      date('startDate', 'Bắt đầu làm việc'),
      choice('contract', 'Loại hợp đồng', [
        'Lao động',
        'Dịch vụ / cộng tác',
        'Chưa rõ',
      ]),
      text('recipientBank', 'Ngân hàng nhận lương'),
      text('recipientAccount', 'Số tài khoản nhận lương'),
    ],
    'Tên nguồn lương chỉ để đối chiếu, không tự tạo tài khoản đăng nhập. Không suy ra giờ làm từ điểm danh học sinh.',
    15,
  ),
  module(
    'rates',
    'Đơn giá lương',
    5,
    null,
    [],
    [
      ref('employeeRef', 'Nhân viên', 'employees'),
      choice('basis', 'Cách trả', [
        'Theo tháng',
        'Theo giờ',
        'Theo buổi',
        'Chưa rõ',
      ]),
      amount,
      date('from', 'Hiệu lực từ'),
      date('until', 'Hiệu lực đến'),
      ref('classRef', 'Lớp nếu riêng', 'classes'),
      text('approvedBy', 'Người duyệt mức lương'),
    ],
    'Một dòng mỗi đơn giá trong một khoảng hiệu lực. Không mặc định thuế / bảo hiểm bằng 0 khi chưa biết.',
    25,
  ),
  module(
    'work',
    'Công việc đã xác nhận',
    5,
    null,
    [],
    [
      ref('employeeRef', 'Nhân viên', 'employees'),
      date('date', 'Ngày làm việc'),
      ref('classRef', 'Lớp nếu có', 'classes'),
      field('hours', 'Giờ đã xác nhận', 'decimal'),
      field('lessons', 'Buổi đã xác nhận', 'number'),
      text('description', 'Nội dung công việc'),
      text('confirmedBy', 'Người xác nhận'),
    ],
    'Chỉ ghi công việc có căn cứ. Giờ và buổi không được cộng hai lần cho cùng công việc.',
    50,
  ),
  module(
    'payroll',
    'Lương nguồn',
    5,
    'payroll',
    [
      sourceName,
      text('month', 'Tháng nguồn'),
      money('gross', 'Tổng trước khấu trừ'),
      money('deductions', 'Khấu trừ nguồn'),
      money('amount', 'Thực lĩnh nguồn'),
    ],
    [
      money('allowance', 'Phụ cấp bổ sung'),
      money('adjustment', 'Điều chỉnh đề nghị'),
      text('paymentRefs', 'Mã chi lương / ngày trả'),
    ],
    'Số tổng nhập từ bảng lương được giữ nguyên. Điều chỉnh chỉ là đề nghị cần quản lý duyệt; tiền trả liên kết chi phí cũ.',
    10,
  ),
  module(
    'opening',
    'Số dư đầu kỳ',
    6,
    null,
    [],
    [
      text('ledgerCode', 'Mã tài khoản kế toán'),
      text('ledgerName', 'Tên tài khoản kế toán'),
      date('asOf', 'Tại ngày'),
      money('debit', 'Dư Nợ'),
      money('credit', 'Dư Có'),
      text('counterpartyRef', 'Mã học sinh / NCC nếu có'),
    ],
    'Kế toán xác nhận ngày và số dư. Không nhập số dư lũy kế thành phiếu thu. Không đoán tài khoản hoặc chế độ kế toán.',
    40,
  ),
  module(
    'reconciliation',
    'Đối chiếu ngân hàng',
    6,
    null,
    [],
    [
      ref('accountRef', 'Tài khoản công ty', 'accounts'),
      period(),
      money('opening', 'Số dư sao kê đầu'),
      money('closing', 'Số dư sao kê cuối'),
      text('unmatched', 'Mã giao dịch chưa khớp'),
      text('explanation', 'Giải thích chênh lệch'),
    ],
    'Đính kèm sao kê đầy đủ kỳ. Dấu đã xem không chứng minh đã khớp. Từng giao dịch ngân hàng được nhập bằng mẫu ngân hàng riêng khi đối chiếu.',
    24,
  ),
  module(
    'funding',
    'Vốn và khoản vay',
    7,
    null,
    [],
    [
      text('party', 'Người / tổ chức'),
      choice('type', 'Loại', [
        'Góp vốn',
        'Vay nhận',
        'Vay trả',
        'Chủ chi hộ',
        'Hoàn tiền chủ',
        'Chưa rõ',
      ]),
      date('date', 'Ngày'),
      amount,
      money('interest', 'Lãi / phí riêng'),
      text('cashRef', 'Mã thu / chi đã ghi'),
      text('terms', 'Điều khoản'),
    ],
    'Tiền gốc và chuyển nội bộ không phải doanh thu / chi phí. Dùng mã tiền đã ghi để tránh đếm hai lần.',
    15,
  ),
  module(
    'deposits',
    'Đặt cọc',
    7,
    null,
    [],
    [
      text('party', 'Đối tác / gia đình'),
      choice('direction', 'Chiều', [
        'Công ty đã trả cọc',
        'Công ty đã nhận cọc',
      ]),
      date('date', 'Ngày'),
      amount,
      date('returnDue', 'Hạn hoàn cọc'),
      text('cashRef', 'Mã thu / chi đã ghi'),
      text('terms', 'Điều kiện hoàn'),
    ],
    'Cọc có thể hoàn lại cần tách khỏi doanh thu / chi phí. Không coi giảm nghĩa vụ là đã hoàn tiền mặt.',
    15,
  ),
  module(
    'budgets',
    'Ngân sách',
    7,
    null,
    [],
    [
      period(),
      text('category', 'Nhóm ngân sách'),
      amount,
      ref('classRef', 'Lớp nếu có', 'classes'),
      text('assumption', 'Giả định / cơ sở'),
      text('approvedBy', 'Người duyệt'),
    ],
    'Ngân sách và dự báo không phải tiền đã thu / chi. Không coi gia hạn chưa thỏa thuận là doanh thu chắc chắn.',
    24,
  ),
  module(
    'stock',
    'Sách và vật tư',
    7,
    null,
    [],
    [
      text('name', 'Tên sách / vật tư'),
      text('sku', 'Mã hàng nếu có'),
      choice('unit', 'Đơn vị', ['Quyển', 'Bộ', 'Cái', 'Hộp', 'Khác']),
      field('quantity', 'Tồn thực tế', 'number'),
      date('countDate', 'Ngày kiểm đếm'),
      text('countedBy', 'Người kiểm đếm'),
      field('minimum', 'Mức cảnh báo', 'number'),
    ],
    'Chỉ hàng vật lý, không ghi buổi học. Số dư tồn cần kiểm đếm và duyệt; không tự suy ra giá trị tồn kho pháp định.',
    25,
  ),
  module(
    'equipment',
    'Thiết bị và trả trước',
    7,
    null,
    [],
    [
      text('name', 'Tên thiết bị / khoản trả trước'),
      choice('type', 'Loại', ['Thiết bị', 'Chi phí trả trước', 'Cần kiểm tra']),
      date('purchaseDate', 'Ngày mua'),
      amount,
      text('purchaseRef', 'Mã hóa đơn / chi đã ghi'),
      text('custodian', 'Người quản lý / vị trí'),
      date('scheduleFrom', 'Bắt đầu phân bổ'),
      field('months', 'Số tháng đề nghị', 'number'),
    ],
    'Lịch khấu hao / phân bổ chỉ lập theo cấu hình kế toán đã duyệt. Không ghi chi phí mua ban đầu lần nữa.',
    20,
  ),
  module(
    'evidence',
    'Danh sách tệp',
    8,
    null,
    [],
    [
      text('name', 'Mã tệp dễ nhận biết'),
      text('fileName', 'Tên tệp / đường dẫn chia sẻ'),
      text('recordRefs', 'Mã dòng liên quan'),
      date('date', 'Ngày chứng từ'),
      choice('type', 'Loại', [
        'Sao kê',
        'Hợp đồng',
        'Hóa đơn PDF',
        'Hóa đơn XML',
        'Bảng lương',
        'Biên nhận thuế',
        'Khác',
      ]),
      text('coverage', 'Kỳ / phạm vi chứng từ'),
    ],
    'Chỉ liệt kê tệp; chưa tải tệp vào BOH. Gửi tài liệu qua kênh riêng an toàn, không chia sẻ công khai workbook này.',
    30,
  ),
];
export const preparationAreas = [
  ['Công ty và tài khoản', ['company', 'accounts']],
  [
    'Học sinh, gia đình và học phí',
    ['students', 'families', 'catalogue', 'agreements', 'installments'],
  ],
  ['Tiền thu và phân bổ', ['receipts', 'allocations']],
  [
    'Nhà cung cấp và chi phí',
    ['suppliers', 'bills', 'expenses', 'commitments'],
  ],
  ['Nhân sự, đơn giá và công việc', ['employees', 'rates', 'work', 'payroll']],
  ['Số dư và đối chiếu', ['opening', 'reconciliation']],
  [
    'Chỉ điền nếu có phát sinh',
    ['funding', 'deposits', 'budgets', 'stock', 'equipment'],
  ],
  ['Chứng từ và thiết lập', ['evidence', 'company']],
];
export const prepColumns = (m) => [
  field('_ref', 'Mã dòng (giữ nguyên)'),
  ...m.original.map((f) => ({ ...f, key: 'original.' + f.key })),
  choice('review', 'Kế toán kiểm tra', reviewChoices),
  ...m.inputs.map((f) => ({
    ...f,
    label: f.label + (preparationRequired[m.key]?.includes(f.key) ? ' *' : ''),
  })),
  text('reason', 'Lý do sửa / ghi chú'),
  evidence,
];

// Identity fields are also available for the reserved new-entry rows.
preparationModules
  .find((m) => m.key === 'students')
  .inputs.unshift(text('name', 'Họ tên đúng / học sinh mới'));
preparationModules
  .find((m) => m.key === 'students')
  .original.push(text('phone', 'Điện thoại nguồn'));
preparationModules
  .find((m) => m.key === 'expenses')
  .inputs.unshift(text('description', 'Nội dung đúng / khoản chi mới'));

export const preparationRequired = {
  company: ['value'],
  accounts: ['name', 'holder', 'type'],
  students: ['name'],
  families: ['name', 'guardian'],
  catalogue: ['name', 'sessions', 'price', 'effectiveFrom'],
  agreements: ['studentRef', 'agreedFee', 'sessions', 'startDate', 'scope'],
  installments: ['agreementRef', 'dueDate', 'amount'],
  receipts: ['date', 'name', 'amount', 'account'],
  allocations: ['receiptRef', 'amount', 'purpose'],
  suppliers: ['name'],
  bills: ['supplierRef', 'number', 'date', 'amount'],
  expenses: ['description', 'date', 'amount', 'account'],
  commitments: ['supplierRef', 'amount', 'frequency', 'nextDue'],
  employees: ['name', 'startDate'],
  rates: ['employeeRef', 'basis', 'amount', 'from', 'approvedBy'],
  work: ['employeeRef', 'date', 'confirmedBy'],
  payroll: ['paymentRefs'],
  opening: ['ledgerCode', 'asOf'],
  reconciliation: ['accountRef', 'month', 'opening', 'closing'],
  funding: ['party', 'type', 'date', 'amount'],
  deposits: ['party', 'direction', 'date', 'amount'],
  budgets: ['month', 'category', 'amount'],
  stock: ['name', 'unit', 'quantity', 'countDate', 'countedBy'],
  equipment: ['name', 'type', 'purchaseDate', 'amount'],
  evidence: ['name', 'fileName', 'type'],
};

export function buildPreparation(snapshot) {
  const records = snapshot.records;
  const byId = new Map(records.map((r) => [r.id, r]));
  const name = (id) => byId.get(id)?.payload?.name || '';
  const rowsByModule = {};
  const sourceRows = (m) =>
    records
      .filter((r) => r.kind === m.kind)
      .map((r) => {
        const p = r.payload;
        return {
          recordId: r.id,
          kind: r.kind,
          revision: r.revision,
          updatedAt: r.updated_at || r.updatedAt,
          original: {
            ...p,
            name:
              m.kind === 'package'
                ? name(r.student_id || r.studentId || p.studentId)
                : p.name || p.label || p.description || '',
            className: name(r.class_id || r.classId || p.classId),
            date: r.date || p.date || p.startDate || '',
            amount:
              m.kind === 'package'
                ? p.agreedFee
                : m.kind === 'catalogue'
                  ? p.price
                  : m.kind === 'payroll'
                    ? p.net
                    : p.amount,
          },
        };
      });
  for (const m of preparationModules) {
    let rows = m.kind ? sourceRows(m) : [];
    if (m.key === 'company')
      rows = [
        ['Tên pháp nhân', 'CÔNG TY TNHH BEN OXFORD HUB'],
        ['Giám đốc / người sáng lập', 'Karam Mouelhi'],
        ['Email Giám đốc', 'karammouelhi@gmail.com'],
        ['Tên gọi khác của Giám đốc', 'Ben / Karam Ben / Karam Ben Mouelhi'],
        ['Tiền tệ', 'VND'],
        ['Múi giờ', 'Asia/Ho_Chi_Minh'],
        ['Mã số thuế', ''],
        ['Địa chỉ pháp lý', ''],
        ['Ngày chốt số dư / chuyển sang BOH', ''],
        ['Chế độ kế toán đang áp dụng', ''],
        ['Năm tài chính / kỳ báo cáo', ''],
        ['Phương pháp thuế và cấu hình học phí', ''],
        ['Cấu hình thuế thu nhập cá nhân + hiệu lực', ''],
        ['Cấu hình bảo hiểm + hiệu lực', ''],
        ['Sơ đồ tài khoản / ánh xạ báo cáo', ''],
        ['Phương pháp doanh thu học phí đã duyệt', ''],
        ['Nguồn dữ liệu MISA / kỳ còn thiếu', ''],
        ['Quyền API MISA đã được xác minh', ''],
        ['Bằng chứng hóa đơn XML / ký số', ''],
        ['Biên nhận khai thuế đã nộp / chấp nhận', ''],
        ['Người kế toán chuẩn bị', ''],
        ['Người quản lý phê duyệt và ngày', ''],
      ].map(([name, value]) => ({ original: { name, value } }));
    if (m.key === 'accounts')
      rows = company.map((name) => ({ original: { name } }));
    if (m.key === 'employees')
      rows = records
        .filter((r) => r.kind === 'payroll')
        .filter(
          (r, i, a) =>
            a.findIndex((v) => v.payload.name === r.payload.name) === i,
        )
        .map((r) => ({
          original: { name: r.payload.name, position: r.payload.position },
          sourceRecordId: r.id,
        }));
    if (m.key === 'allocations')
      rows = records
        .filter((r) => r.kind === 'receipt')
        .flatMap((r) =>
          (r.payload.allocations || []).map((a, i) => ({
            recordId: r.id,
            kind: 'receipt',
            revision: r.revision,
            updatedAt: r.updated_at || r.updatedAt,
            allocationIndex: i,
            original: {
              name: (r.payload.name || '') + ' → ' + name(a.studentId),
              amount: a.amount,
            },
            allocation: a,
          })),
        );
    const prefix = m.key.toUpperCase().slice(0, 4);
    rows = rows.map((r, i) => ({
      ...r,
      ref: prefix + '-' + String(i + 1).padStart(4, '0'),
      existing: true,
      original: Object.fromEntries(
        m.original.map((f) => [f.key, r.original?.[f.key] ?? '']),
      ),
    }));
    const existingCount = rows.length;
    rows.push(
      ...Array.from({ length: m.blank }, (_, i) => ({
        ref: prefix + '-N' + String(i + 1).padStart(3, '0'),
        existing: false,
        original: {},
      })),
    );
    rowsByModule[m.key] = { sheet: m.sheet, existingCount, rows };
  }
  return {
    version: preparationVersion,
    capturedAt: snapshot.capturedAt,
    sourceFingerprint: snapshot.fingerprint,
    source: 'BOH — bản chụp dữ liệu vận hành, chưa xác nhận kế toán',
    tables: rowsByModule,
    classes: records
      .filter((r) => r.kind === 'class')
      .map((r) => ({
        id: r.id,
        name: r.payload.name,
        archived: r.payload.archived,
      })),
    controlTotals: {
      augustCollections: records
        .filter((r) => r.kind === 'receipt' && r.date?.startsWith('2026-08'))
        .reduce((s, r) => s + Number(r.payload.amount || 0), 0),
      januaryToMayExpenses: [1, 2, 3, 4, 5].map((n) =>
        records
          .filter(
            (r) => r.kind === 'expense' && r.date?.startsWith('2026-0' + n),
          )
          .reduce((s, r) => s + Number(r.payload.amount || 0), 0),
      ),
    },
  };
}

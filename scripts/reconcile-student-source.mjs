// Read-only reconciliation planner. Emits a guarded change set; never writes DB.
// Source snapshots and backups stay in ignored private-data, never source control.
import fs from 'node:fs';
const backup = fs
  .readdirSync('private-data/backup-20260910')
  .flatMap((f) =>
    JSON.parse(fs.readFileSync('private-data/backup-20260910/' + f, 'utf8')),
  );
const live = JSON.parse(
  fs.readFileSync('private-data/student-source-20260910.json', 'utf8'),
);
const classes = JSON.parse(
  fs.readFileSync('private-data/student-classes-20260910.json', 'utf8'),
);
const sheets = [...live.sheets, ...classes.sheets];
const value = (c) =>
  c?.effectiveValue?.numberValue ??
  c?.effectiveValue?.stringValue ??
  c?.effectiveValue?.boolValue ??
  null;
const number = (c) => (typeof value(c) === 'number' ? value(c) : null);
const normalize = (s) =>
  String(s || '')
    .normalize('NFC')
    .toLocaleLowerCase('vi')
    .replace(/[\s.\-_/()]+/g, '');
const row = (s, n) => s.data[0].rowData[n - 1]?.values || [];
const column = (n) => {
  let s = '';
  for (n++; n; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const excelDate = (n) =>
  new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
const find = (id) => backup.find((r) => r.id === id);
const changes = new Map(),
  warnings = [],
  counts = {
    packages: 0,
    balancesChanged: 0,
    attendanceAdded: 0,
    attendanceCorrected: 0,
    aliases: 0,
    stopped: 0,
    classKeys: 0,
  };
function edit(old) {
  if (!changes.has(old.id))
    changes.set(old.id, { before: old, after: structuredClone(old) });
  return changes.get(old.id).after;
}
const tuition = sheets.find((s) => s.properties.title === 'Check học phí ver2');
for (const pkg of backup.filter((r) => r.kind === 'package')) {
  const n = +(pkg.payload.source.match(/!D(\d+)/) || [])[1],
    cells = row(tuition, n),
    p = pkg.payload;
  if (!n || !cells.length) throw Error('Missing source row ' + pkg.id);
  const student = find(p.studentId);
  if (normalize(value(cells[3])) !== normalize(student.payload.name)) {
    warnings.push({
      id: pkg.id,
      type: 'Name needs review',
      sourceName: value(cells[3]),
      appName: student.payload.name,
    });
    continue;
  }
  if (
    number(cells[5]) !== (typeof p.sessions === 'number' ? p.sessions : null) ||
    number(cells[9]) !==
      (typeof p.sourcePaid === 'number' ? p.sourcePaid : null)
  )
    throw Error('Contract/payment changed; separate review required ' + pkg.id);
  if (
    backup.some(
      (r) =>
        ['attendance', 'makeup'].includes(r.kind) &&
        r.student_id === p.studentId &&
        !r.payload.historical &&
        r.date <= '2026-09-09',
    )
  )
    throw Error('App events overlap source snapshot ' + p.studentId);
  const next = edit(pkg).payload;
  next.sessionSnapshots = [
    { date: '2026-09-08', remaining: p.sourceRemaining },
    { date: '2026-09-09', remaining: number(cells[6]) },
  ];
  next.sessionBaselineDate = '2026-09-09';
  for (const [key, col] of Object.entries({
    sourceRemaining: 6,
    sourceAttended: 7,
    sourceAbsences: 8,
    sourceDeducted: 10,
    sourceValueRemaining: 11,
  }))
    next[key] = number(cells[col]);
  next.rawRemaining = value(cells[6]);
  next.liveSourceNote = cells
    .slice(12, 16)
    .map(value)
    .filter((x) => x != null)
    .join(' / ');
  next.sourceVerifiedAt = '2026-09-10';
  counts.packages++;
  if (next.sourceRemaining !== p.sourceRemaining) counts.balancesChanged++;
}
for (const student of backup.filter((r) => r.kind === 'student'))
  if (student.class_id !== student.payload.classId) {
    edit(student).class_id = student.payload.classId;
    counts.classKeys++;
  }
for (const [aliasId, currentId] of [
  ['HIS-014', 'STU-105'],
  ['HIS-015', 'STU-106'],
]) {
  const a = find(aliasId),
    c = find(currentId),
    n = +currentId.slice(4),
    note = row(tuition, n).slice(12, 16).map(value).join(' ');
  if (
    normalize(a.payload.name) !== normalize(c.payload.name) ||
    a.payload.parent !== c.payload.parent ||
    !note.includes('Chuyển từ Dewey 1 sang Bloom 3')
  )
    throw Error('Transfer evidence failed');
  Object.assign(edit(a).payload, {
    status: 'Transferred',
    canonicalStudentId: currentId,
    linkEvidence:
      'Check học phí ver2!N' +
      n +
      ' · explicit Dewey 1 → Bloom 3 transfer; matching parent',
  });
  counts.aliases++;
}
const dewey = sheets.find((s) => s.properties.title === 'BOH Dewey 1');
for (const st of backup.filter(
  (r) =>
    r.kind === 'student' &&
    r.id.startsWith('HIS-') &&
    r.payload.source?.startsWith('BOH Dewey 1!'),
)) {
  const n = +st.payload.source.split('!')[1],
    cells = row(dewey, n),
    label = cells.slice(0, 3).map(value).join(' ');
  if (
    !changes.get(st.id)?.after.payload.canonicalStudentId &&
    st.payload.status === 'Roster only' &&
    /stop|nghỉ hẳn/i.test(label) &&
    normalize(value(cells[3])) === normalize(st.payload.name)
  ) {
    Object.assign(edit(st).payload, {
      status: 'Stopped',
      sourceStatusNote: label,
    });
    counts.stopped++;
  }
}
for (const member of backup.filter((r) => r.kind === 'membership')) {
  const cls = find(member.class_id),
    sheet = sheets.find((s) => s.properties.title === cls?.payload.name);
  if (!sheet) {
    warnings.push({ id: member.id, type: 'Class source missing' });
    continue;
  }
  let sourceRow = member.payload.sourceRow,
    cells = row(sheet, sourceRow);
  const head = row(sheet, 2),
    nameIndex = head.findIndex((c) => value(c) === 'TÊN HS'),
    parentIndex = head.findIndex((c) => value(c) === 'ZALO BA MẸ');
  if (
    normalize(value(cells[nameIndex])) !== normalize(member.payload.sourceName)
  ) {
    const candidates = sheet.data[0].rowData
      .map((r, i) => ({ cells: r.values || [], n: i + 1 }))
      .filter(
        (r) =>
          normalize(value(r.cells[nameIndex])) ===
            normalize(member.payload.sourceName) &&
          normalize(value(r.cells[parentIndex])) ===
            normalize(find(member.student_id)?.payload.parent),
      );
    if (candidates.length !== 1) {
      warnings.push({ id: member.id, type: 'Roster identity needs review' });
      continue;
    }
    sourceRow = candidates[0].n;
    cells = candidates[0].cells;
    edit(member).payload.sourceRow = sourceRow;
  }
  for (let col = 0; col < head.length; col++) {
    const serial = number(head[col]);
    if (serial == null || serial < 45000 || serial > 50000) continue;
    const date = excelDate(serial);
    if (date > '2026-09-09') continue;
    const mark = String(value(cells[col]) ?? '')
        .trim()
        .toUpperCase(),
      id = 'att-' + member.id.replace('member-', '') + '-' + date,
      old = find(id);
    if (!['C', 'M', 'L', 'K'].includes(mark)) {
      if (old && String(old.payload.mark).trim().toUpperCase() !== mark) {
        if (mark) {
          const next = edit(old);
          next.payload.mark = String(value(cells[col])).trim();
          next.payload.note = cells[col]?.note || '';
          next.payload.source =
            sheet.properties.title + '!' + column(col) + sourceRow;
          counts.attendanceCorrected++;
        } else
          warnings.push({ id, type: 'Blank historical source needs review' });
      }
      continue;
    }
    if (old && !old.payload.historical)
      throw Error('Historical source conflicts with app attendance ' + id);
    if (old && old.payload.mark === mark) continue;
    if (old) {
      const next = edit(old);
      next.payload.mark = mark;
      next.payload.note = cells[col]?.note || '';
      next.payload.source =
        sheet.properties.title + '!' + column(col) + sourceRow;
      counts.attendanceCorrected++;
    } else {
      const payload = {
        date,
        mark,
        note: cells[col]?.note || '',
        source: sheet.properties.title + '!' + column(col) + sourceRow,
        classId: member.class_id,
        studentId: member.student_id,
        historical: true,
        membershipId: member.id,
      };
      changes.set(id, {
        before: null,
        after: {
          id,
          kind: 'attendance',
          class_id: member.class_id,
          student_id: member.student_id,
          date,
          payload,
          revision: 1,
          updated_at: '',
        },
      });
      counts.attendanceAdded++;
    }
  }
}
console.log(
  JSON.stringify({ counts, warnings, changes: [...changes.values()] }),
);

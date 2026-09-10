// Read-only planner. Private input/output must not be committed. Never writes DB.
import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const proofs = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const classes = rows.filter((r) => r.kind === 'class');
const normalize = (value) =>
  String(value || '')
    .normalize('NFC')
    .trim()
    .toLocaleLowerCase('vi')
    .replace(/^boh\s+/, '')
    .replace(/\s+/g, ' ');
const classId = (name) => {
  const value = normalize(name);
  if (!value) return '';
  const exact = classes.filter((c) => normalize(c.payload.name) === value);
  if (exact.length === 1) return exact[0].id;
  if (!['bruner', 'piaget', 'carroll'].includes(value)) return '';
  const single = classes.filter(
    (c) => normalize(c.payload.name).replace(/\s+\d+$/, '') === value,
  );
  return single.length === 1 ? single[0].id : '';
};
const isoDate = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const changes = [];
const counts = {
  dates: 0,
  supportClasses: 0,
  makeupDestinations: 0,
  studentLinks: 0,
};
for (const old of rows) {
  const next = structuredClone(old),
    p = next.payload;
  if (
    p.historical &&
    ['makeup', 'support'].includes(old.kind) &&
    Array.isArray(p.original)
  ) {
    const date = p.original[old.kind === 'makeup' ? 3 : 0];
    if (!p.date && !next.date && isoDate(date)) {
      p.date = next.date = date;
      counts.dates++;
    }
    const c = classId(p.original[2]);
    if (old.kind === 'support' && !next.class_id && !p.classId && c) {
      p.classId = next.class_id = c;
      counts.supportClasses++;
    }
    if (old.kind === 'makeup' && !p.makeupClassId && c) {
      p.makeupClassId = c;
      counts.makeupDestinations++;
    }
  }
  const proof = proofs.find((x) => x.recordId === old.id);
  if (proof && !old.student_id && !p.studentId) {
    const student = rows.find(
      (r) => r.id === proof.studentId && r.kind === 'student',
    );
    const member = rows.find(
      (r) => r.id === proof.membershipId && r.kind === 'membership',
    );
    if (
      p.source !== proof.source ||
      p.name !== proof.recordName ||
      student?.payload.name !== proof.studentName ||
      member?.student_id !== student.id ||
      member?.class_id !== proof.classId ||
      p.packageId ||
      p.allocations?.length
    )
      throw Error('Link evidence changed: ' + old.id);
    p.studentId = next.student_id = student.id;
    p.studentLinkEvidence = proof.evidence;
    counts.studentLinks++;
  }
  if (JSON.stringify(next) !== JSON.stringify(old))
    changes.push({ before: old, after: next });
}
console.log(JSON.stringify({ counts, changes }));

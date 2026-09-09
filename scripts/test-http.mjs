import assert from 'node:assert/strict';
const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
async function req(path, role, body) {
  const headers = role
    ? {
        'oai-authenticated-user-id': 'verification-' + role,
        'oai-authenticated-user-email': role + '-verification@example.test',
      }
    : {};
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(origin + path, {
    headers,
    method: body ? 'POST' : 'GET',
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
const ta = await req('/api/state', 'ta');
assert.equal(ta.status, 200);
assert.equal(ta.data.actor.role, 'TA');
assert.equal(ta.data.members.length, 0);
assert.equal(ta.data.activity.length, 0);
assert.equal(ta.data.records.filter((r) => r.kind === 'class').length, 1);
assert.ok(
  ta.data.records.every((r) =>
    [
      'student',
      'class',
      'membership',
      'attendance',
      'makeup',
      'support',
      'calendar',
    ].includes(r.kind),
  ),
);
assert.ok(
  ta.data.records
    .filter((r) => r.kind === 'student')
    .every((r) => !('phone' in r.payload) && !('parent' in r.payload)),
);
assert.equal((await req('/api/source?q=Payroll', 'ta')).status, 403);
assert.equal(
  (await req('/api/record', 'ta', { kind: 'expense', payload: { amount: 1 } }))
    .status,
  403,
);
assert.equal(
  (
    await req('/api/record', 'ta', {
      kind: 'attendance',
      payload: { classId: 'class-2' },
    })
  ).status,
  403,
);
assert.equal(
  (
    await req('/api/staff', 'ta', {
      email: 'x@example.test',
      role: 'Director',
      name: 'x',
    })
  ).status,
  403,
);
assert.equal((await req('/api/state', 'outsider')).status, 403);
const finance = await req('/api/state', 'finance');
assert.equal(finance.status, 200);
assert.equal(finance.data.actor.role, 'Finance');
assert.equal(finance.data.members.length, 0);
assert.ok(!finance.data.records.some((r) => r.kind === 'lead'));
assert.ok(finance.data.records.some((r) => r.kind === 'payroll'));
assert.equal(
  (
    await req('/api/record', 'finance', {
      kind: 'attendance',
      payload: { classId: 'class-1' },
    })
  ).status,
  403,
);
console.log(
  'HTTP checks passed: TA receives assigned attendance only; finance and source/staff endpoints enforce roles; nonmember denied.',
);

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import ts from 'typescript';
const url = (code) =>
  'data:text/javascript;base64,' +
  Buffer.from(
    ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    }).outputText,
  ).toString('base64');
const types = url(fs.readFileSync('lib/types.ts', 'utf8'));
const keyModule = url(fs.readFileSync('lib/command-key.ts', 'utf8'));
const accountUrl = url(fs.readFileSync('lib/receipt-accounts.ts', 'utf8'));
const fieldUrl = url(
  fs
    .readFileSync('lib/entry-fields.ts', 'utf8')
    .replace("from './receipt-accounts'", `from '${accountUrl}'`),
);
const experienceUrl = url(
  fs
    .readFileSync('lib/entry-experience.ts', 'utf8')
    .replace("from './entry-fields'", `from '${fieldUrl}'`)
    .replace("from './receipt-accounts'", `from '${accountUrl}'`),
);
const domain = url(
  fs
    .readFileSync('lib/domain.ts', 'utf8')
    .replaceAll("from './types'", `from '${types}'`),
);
const storage = url(
  `export class StorageError extends Error{}; export const findRecord=async()=>null; export const listRecords=async()=>[]; export const decodeRecord=r=>r; export const storeCall=async(op,args)=>{globalThis.authQA.calls.push({op,args}); return globalThis.authQA.store(op,args);};`,
);
const nativeCode = fs
  .readFileSync('lib/password-auth.ts', 'utf8')
  .replace(
    "import { env } from 'cloudflare:workers';",
    "const env={SUPABASE_URL:'https://example.test',SUPABASE_SECRET_KEY:'synthetic-server-key',get BOH_HOSTING_TARGET(){return globalThis.authQA?.hostingTarget}};",
  )
  .replace(
    "import { cookies } from 'next/headers';",
    'const cookies=async()=>({get:()=>({value:globalThis.authQA.token})});',
  )
  .replace(
    "import { createClient } from '@supabase/supabase-js';",
    'const createClient=(...args)=>{globalThis.authQA.clients.push(args);return globalThis.authQA.client;};',
  )
  .replaceAll("from './storage'", `from '${storage}'`)
  .replaceAll("from './types'", `from '${types}'`);
const nativeUrl = url(nativeCode),
  native = await import(nativeUrl);
const serverUrl = url(
  fs
    .readFileSync('lib/server.ts', 'utf8')
    .replace("import { env } from 'cloudflare:workers';", 'const env={};')
    .replaceAll("from './password-auth'", `from '${nativeUrl}'`)
    .replaceAll("from './storage'", `from '${storage}'`)
    .replaceAll("from './types'", `from '${types}'`)
    .replaceAll("from './command-key'", `from '${keyModule}'`)
    .replaceAll("from './receipt-accounts'", `from '${accountUrl}'`)
    .replaceAll("from './domain'", `from '${domain}'`)
    .replace(
      "import imported from '@boh/private-import';",
      'const imported={manifest:{},records:[]};',
    ),
);
const server = await import(serverUrl);
const draftKindsUrl = url(fs.readFileSync('lib/drafts.ts', 'utf8'));
const draftsUrl = url(
  fs
    .readFileSync('lib/drafts-server.ts', 'utf8')
    .replaceAll("from './server'", `from '${serverUrl}'`)
    .replaceAll("from './storage'", `from '${storage}'`)
    .replaceAll("from './drafts'", `from '${draftKindsUrl}'`),
);
const accountingDomainUrl = url(fs.readFileSync('lib/accounting.ts', 'utf8'));
const filtersUrl = url(
  fs
    .readFileSync('lib/record-filters.ts', 'utf8')
    .replace("from './domain'", `from '${domain}'`),
);
const viewsUrl = url(
  fs
    .readFileSync('lib/saved-views-server.ts', 'utf8')
    .replace("from './server'", `from '${serverUrl}'`)
    .replace("from './storage'", `from '${storage}'`)
    .replace("from './record-filters'", `from '${filtersUrl}'`),
);
const accountingUrl = url(
  fs
    .readFileSync('lib/accounting-server.ts', 'utf8')
    .replaceAll("from './receipt-accounts'", `from '${accountUrl}'`)
    .replaceAll("from './server'", `from '${serverUrl}'`)
    .replaceAll("from './storage'", `from '${storage}'`)
    .replaceAll("from './accounting'", `from '${accountingDomainUrl}'`),
);
// Parsing and review have dedicated tests. These route tests must reject
// restricted sessions before either helper can inspect a workbook.
const preparationUrl = url(
  fs
    .readFileSync('lib/preparation-server.ts', 'utf8')
    .replace("import { env } from 'cloudflare:workers';", 'const env={};')
    .replaceAll("from './server'", `from '${serverUrl}'`)
    .replaceAll("from './storage'", `from '${storage}'`)
    .replace(
      "import { parsePreparationFile } from './preparation-file';",
      "const parsePreparationFile=()=>{throw Error('Parser reached before authorization');};",
    )
    .replace(
      "import { reviewPreparation } from './preparation-review';",
      "const reviewPreparation=()=>{throw Error('Review reached before authorization');};",
    ),
);
const route = async (path) =>
  import(
    url(
      fs
        .readFileSync(path, 'utf8')
        .replaceAll("from '@/lib/server'", `from '${serverUrl}'`)
        .replaceAll("from '@/lib/entry-experience'", `from '${experienceUrl}'`)
        .replaceAll("from '@/lib/domain'", `from '${domain}'`)
        .replaceAll("from '@/lib/password-auth'", `from '${nativeUrl}'`)
        .replaceAll("from '@/lib/storage'", `from '${storage}'`)
        .replaceAll("from '@/lib/drafts-server'", `from '${draftsUrl}'`)
        .replaceAll("from '@/lib/saved-views-server'", `from '${viewsUrl}'`)
        .replaceAll(
          "from '@/lib/preparation-server'",
          `from '${preparationUrl}'`,
        )
        .replaceAll(
          "from '@/lib/accounting-server'",
          `from '${accountingUrl}'`,
        ),
    )
  );
const login = await route('app/api/auth/login/route.ts'),
  password = await route('app/api/auth/password/route.ts'),
  logout = await route('app/api/auth/logout/route.ts');
const fixture = {
  id: 'staff',
  user_id: 'stable-staff-id',
  auth_user_id: 'auth-staff-id',
  email: 'staff@example.test',
  name: 'Staff',
  role: 'TA',
  class_ids: [],
  active: true,
  credential_version: 3,
  password_fingerprint: 'fingerprint',
  must_change_password: true,
  setup_only: true,
};
function setup() {
  const q = (globalThis.authQA = {
    token: 'a'.repeat(64),
    session: { ...fixture },
    calls: [],
    clients: [],
    updateIds: [],
  });
  q.store = async (op) =>
    op === 'auth_session'
      ? q.session
      : op === 'auth_rate_limit'
        ? { allowed: true }
        : op === 'auth_login_state'
          ? fixture
          : op === 'auth_create_session'
            ? { mustChangePassword: true, expiresIn: 1200 }
            : op === 'auth_password_finish'
              ? { expiresIn: 28800 }
              : {};
  q.client = {
    auth: {
      signInWithPassword: async ({ password }) =>
        password === 'temporary-test-password'
          ? {
              data: { user: { id: fixture.auth_user_id }, session: {} },
              error: null,
            }
          : {
              data: { user: null, session: null },
              error: { message: 'invalid' },
            },
      signOut: async () => ({ error: null }),
      admin: {
        updateUserById: async (id) => {
          q.updateIds.push(id);
          return { error: null };
        },
      },
    },
  };
  return q;
}
const req = (path, data, origin = 'https://boh.example') =>
  new Request('https://boh.example/api/auth/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin },
    body: JSON.stringify(data),
  });
test('anonymous and temporary sessions cannot become an app actor', async () => {
  const q = setup();
  q.session = null;
  await assert.rejects(server.actor(), (e) => e.status === 401);
  q.session = { ...fixture };
  await assert.rejects(server.actor(), (e) => e.status === 428);
  q.session = { ...fixture, must_change_password: false, setup_only: false };
  assert.deepEqual(await server.actor(), {
    userId: 'stable-staff-id',
    email: fixture.email,
    name: 'Staff',
    role: 'TA',
    classIds: [],
    allClasses: true,
    active: true,
  });
});
test('all record API entrypoints reject temporary-password access', async () => {
  setup();
  for (const path of [
    'state',
    'record',
    'staff',
    'source',
    'import',
    'student-action',
    'student-link',
    'drafts',
    'accounting',
    'views',
    'preparation',
  ]) {
    const file = `app/api/${path}/route.ts`;
    if (!fs.existsSync(file)) continue;
    const api = await route(file);
    for (const fn of [api.GET, api.POST].filter(Boolean)) {
      const response = await fn(req(path, {}));
      assert.equal(response.status, 428, path);
    }
  }
});
test('drafts and finance read/write routes reject anonymous, inactive and TA access before storage', async () => {
  for (const session of [
    null,
    { ...fixture, setup_only: false, must_change_password: false },
    {
      ...fixture,
      role: 'Finance',
      active: false,
      setup_only: false,
      must_change_password: false,
    },
  ]) {
    const q = setup();
    q.session = session;
    for (const path of ['drafts', 'accounting', 'preparation']) {
      const api = await route('app/api/' + path + '/route.ts');
      for (const fn of [api.GET, api.POST]) {
        const response = await fn(req(path, { operation: 'pay' }));
        assert.equal(response.status, session ? 403 : 401);
        assert.match(response.headers.get('cache-control'), /no-store/);
      }
    }
    assert.equal(
      q.calls.every((c) => c.op === 'auth_session'),
      true,
    );
  }
});
test('saved-view API rechecks role and binds ownership independently of client input', async () => {
  const api = await route('app/api/views/route.ts');
  for (const session of [
    null,
    { ...fixture, setup_only: false, must_change_password: false },
    {
      ...fixture,
      role: 'Finance',
      active: false,
      setup_only: false,
      must_change_password: false,
    },
  ]) {
    const q = setup();
    q.session = session;
    const result = await api.GET(
      new Request('https://boh.example/api/views?module=receipts'),
    );
    assert.equal(result.status, session ? 403 : 401);
    assert.ok(q.calls.every((c) => c.op === 'auth_session'));
  }
  const q = setup();
  q.session = {
    ...fixture,
    role: 'Finance',
    setup_only: false,
    must_change_password: false,
  };
  const body = {
    operation: 'save',
    module: 'receipts',
    id: crypto.randomUUID(),
    name: 'Private',
    roles: [],
    owner_id: 'another-account',
    actorId: 'another-account',
    spec: { query: '', facets: { account: ['Cash'] }, columns: ['amount'] },
  };
  assert.equal((await api.POST(req('views', body))).status, 200);
  assert.equal(
    q.calls.find((c) => c.op === 'view_save').args.actorId,
    fixture.user_id,
  );
  assert.equal(
    (await api.POST(req('views', { ...body, roles: ['Director'] }))).status,
    403,
  );
  assert.equal(
    (await api.GET(new Request('https://boh.example/api/views?module=leads')))
      .status,
    403,
  );
  assert.equal(
    (
      await api.POST(
        req('views', {
          ...body,
          spec: { ...body.spec, facets: { password: ['secret'] } },
        }),
      )
    ).status,
    400,
  );
});
test('login normalizes email, ignores requested role, rate-limits first and sends only opaque cookie', async () => {
  const q = setup();
  const r = await login.POST(
    req('login', {
      email: ' STAFF@EXAMPLE.TEST ',
      password: 'temporary-test-password',
      role: 'Director',
    }),
  );
  assert.equal(r.status, 200);
  assert.equal((await r.json()).next, '/change-password');
  const cookie = r.headers.get('set-cookie');
  assert.match(
    cookie,
    /__Host-boh-session=[a-f0-9]{64}; HttpOnly; Path=\/; SameSite=Lax; Max-Age=1200; Secure/,
  );
  assert.equal(q.calls[0].op, 'auth_rate_limit');
  const issue = q.calls.find((c) => c.op === 'auth_create_session');
  assert.equal(issue.args.version, 3);
  assert.equal(issue.args.passwordFingerprint, 'fingerprint');
  assert.equal(issue.args.role, undefined);
  assert.equal(q.clients[0][2].auth.persistSession, false);
  assert.equal(q.clients[0][2].auth.autoRefreshToken, false);
});
test('wrong password, rate limits and cross-origin requests do not create a session', async () => {
  let q = setup();
  assert.equal(
    (
      await login.POST(
        req('login', { email: fixture.email, password: 'wrong' }),
      )
    ).status,
    401,
  );
  assert.ok(!q.calls.some((c) => c.op === 'auth_create_session'));
  q = setup();
  q.store = async () => ({ allowed: false });
  assert.equal(
    (
      await login.POST(
        req('login', { email: fixture.email, password: 'wrong' }),
      )
    ).status,
    429,
  );
  assert.equal(q.clients.length, 0);
  q = setup();
  assert.equal(
    (
      await login.POST(
        req(
          'login',
          { email: fixture.email, password: 'wrong' },
          'https://attacker.test',
        ),
      )
    ).status,
    403,
  );
  assert.equal(q.calls.length, 0);
});
test('password setup derives account from cookie, replaces session and never accepts current temporary password', async () => {
  let q = setup();
  let r = await password.POST(
    req('password', {
      password: 'temporary-test-password',
      confirmation: 'temporary-test-password',
    }),
  );
  assert.equal(r.status, 400);
  assert.equal(q.updateIds.length, 0);
  q = setup();
  r = await password.POST(
    req('password', {
      password: 'a brand new long password',
      confirmation: 'a brand new long password',
      email: 'director@example.test',
      userId: 'forged',
    }),
  );
  assert.equal(r.status, 200);
  assert.deepEqual(q.updateIds, ['auth-staff-id']);
  assert.ok(
    q.calls.findIndex((c) => c.op === 'auth_password_begin') <
      q.calls.findIndex((c) => c.op === 'auth_password_finish'),
  );
  assert.match(r.headers.get('set-cookie'), /Max-Age=28800/);
});
test('provider failure after password begin fails closed and clears the browser cookie', async () => {
  const q = setup();
  q.client.auth.admin.updateUserById = async () => ({
    error: { message: 'provider failed' },
  });
  const r = await password.POST(
    req('password', {
      password: 'a brand new long password',
      confirmation: 'a brand new long password',
    }),
  );
  assert.equal(r.status, 503);
  assert.match(r.headers.get('set-cookie'), /Max-Age=0/);
  assert.ok(!q.calls.some((c) => c.op === 'auth_password_finish'));
});
test('logout revokes only the cookie-derived session and sets matching cookie attributes', async () => {
  const q = setup();
  const r = await logout.POST(req('logout', { token: 'forged' }));
  assert.equal(r.status, 200);
  assert.equal(q.calls.at(-1).args.tokenHash, await native.hashToken(q.token));
  assert.match(
    r.headers.get('set-cookie'),
    /HttpOnly; Path=\/; SameSite=Lax; Max-Age=0; Secure/,
  );
});
test('Hostinger ignores spoofed IP headers while keeping shared and account limits', async () => {
  const q = setup();
  q.hostingTarget = 'node';
  for (const ip of ['192.0.2.1', '192.0.2.2']) {
    await native.limitAuth(
      new Request('https://boh.example.test/api/auth/login', {
        headers: { 'cf-connecting-ip': ip, 'x-forwarded-for': ip },
      }),
      fixture.email,
    );
  }
  assert.equal(q.calls.length, 4);
  assert.deepEqual(q.calls[0], q.calls[2]);
  assert.equal(q.calls[0].args.limit, 60);
  assert.equal(q.calls[1].args.limit, 10);
  assert.equal(
    q.calls[0].args.key,
    await native.hashToken('login:ip:hostinger-shared'),
  );
  assert.equal(
    q.calls[1].args.key,
    await native.hashToken(`login:account:${fixture.email}`),
  );
});

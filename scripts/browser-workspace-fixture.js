// Inject only into the isolated localhost QA browser. All /api requests are
// intercepted; this fixture must never be included in a production bundle.
(() => {
  if (location.hostname !== 'localhost') throw Error('Local QA only');
  const original = window.fetch.bind(window);
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date());
  const record = (kind, id, payload) => ({
    kind,
    id,
    payload: ['receipt', 'expense'].includes(kind)
      ? { ...payload, month: payload.date?.slice(0, 7) }
      : payload,
    revision: 1,
    date: payload.date || '',
    classId: payload.classId || '',
    studentId: payload.studentId || '',
    updatedAt: new Date().toISOString(),
  });
  const state = {
    actor: {
      userId: 'qa',
      email: 'qa@example.invalid',
      name: 'QA Centre Manager',
      role: 'Director',
      classIds: [],
      allClasses: true,
      active: true,
    },
    records: [
      record('class', 'qa-class', {
        name: 'QA Bloom 4',
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        color: '#4466ee',
      }),
      record('student', 'qa-student', {
        name: 'QA Student',
        status: 'Active',
        classId: 'qa-class',
      }),
      record('membership', 'qa-membership', {
        studentId: 'qa-student',
        classId: 'qa-class',
        from: '2026-01-01',
        forecast: true,
      }),
      record('lead', 'qa-lead', {
        name: 'QA Trial Family',
        status: 'New',
        followUp: date,
      }),
      record('expense', 'qa-expense', {
        date: '2026-08-31',
        month: '2026-08',
        amount: 100000,
        category: 'Rent',
        description: 'QA unmatched rent',
        account: 'QA bank',
        reconciled: false,
      }),
      record('catalogue', 'qa-price', {
        label: 'QA offer',
        sessions: 24,
        price: 8000000,
        active: true,
      }),
    ],
    members: [],
    activity: [],
    manifest: { cutoff: '2026-09-08' },
    loadedAt: new Date().toISOString(),
    database: 'QA fixture only',
  };
  let drafts = [];
  let views = [];
  const commands = new Map();
  const bill = {
    id: 'be3a7606-bb68-4e58-aaf7-0526f761705d',
    kind: 'bill',
    date,
    title: 'QA approved rent',
    counterparty: 'QA supplier',
    amount: 100000,
    status: 'Approved',
    revision: 1,
    paid: 0,
    lines: [],
  };
  const accountingDocuments = [bill];
  const accountingSources = [];
  const worksheetCommands = new Map();
  // CSV-only parsing for synthetic browser presentation tests. The real XLSX
  // parser and validation are exercised separately by the server unit tests.
  function csvRows(csv) {
    const rows = [],
      row = [];
    let value = '',
      quoted = false;
    for (let i = 0; i <= csv.length; i++) {
      const c = csv[i];
      if (c === '"') {
        if (quoted && csv[i + 1] === '"') {
          value += '"';
          i++;
        } else quoted = !quoted;
      } else if (!quoted && (c === ',' || c === '\n' || c === undefined)) {
        row.push(value.replace(/\r$/, ''));
        value = '';
        if (c !== ',') {
          if (row.some(Boolean)) rows.push([...row]);
          row.length = 0;
        }
      } else value += c;
    }
    const headers = rows.shift() || [];
    return rows.map((values) =>
      Object.fromEntries(
        headers.map((key, i) => [key.replace(/^\uFEFF/, ''), values[i] || '']),
      ),
    );
  }
  const jsonb = (value) =>
    JSON.parse(
      JSON.stringify(value, (_key, v) =>
        v && typeof v === 'object' && !Array.isArray(v)
          ? Object.fromEntries(
              Object.keys(v)
                .sort()
                .map((k) => [k, v[k]]),
            )
          : v,
      ),
    );
  window.__bohQA = {
    state,
    drafts,
    commands,
    delayDraft: 0,
    failAfterCommit: false,
    failDraftAfterCommit: false,
    failDraftRead: false,
    requests: [],
    accountingDocuments,
    accountingSources,
    worksheetCommands,
    // For an XLSX UI test, set these to the exact synthetic rows in that file.
    accountingWorksheetRows: null,
    worksheetRows: null,
    delayWorksheet: 0,
    failWorksheetAfterCommit: false,
  };
  window.fetch = async (input, options = {}) => {
    const url = new URL(
      typeof input === 'string' ? input : input.url,
      location.origin,
    );
    if (!url.pathname.startsWith('/api/')) return original(input, options);
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : {};
    const qa = window.__bohQA;
    qa.requests.push({ path: url.pathname, query: url.search, method, body });
    let out;
    if (url.pathname === '/api/state') {
      state.loadedAt = new Date().toISOString();
      out = state;
    } else if (url.pathname === '/api/views') {
      if (method === 'GET')
        out = views.filter((v) => v.module === url.searchParams.get('module'));
      else if (body.operation === 'save') {
        out = { ...body, owner_id: state.actor.userId, revision: 1 };
        views = views.filter((v) => v.id !== body.id);
        views.push(out);
      } else {
        views = views.filter((v) => v.id !== body.id);
        out = { deleted: true };
      }
    } else if (url.pathname === '/api/drafts' && method === 'GET') {
      if (qa.failDraftRead) {
        qa.failDraftRead = false;
        throw new TypeError('QA simulated lost draft recovery read');
      }
      out = drafts;
    } else if (url.pathname === '/api/drafts' && body.operation === 'save') {
      if (qa.delayDraft) await new Promise((r) => setTimeout(r, qa.delayDraft));
      const existing = drafts.find((d) => d.id === body.id);
      if (
        existing &&
        JSON.stringify(jsonb(existing.payload)) ===
          JSON.stringify(jsonb(body.payload)) &&
        existing.record_revision === body.recordRevision
      )
        return Response.json(existing);
      if (
        (existing && existing.revision !== body.revision) ||
        (!existing && body.revision)
      )
        return Response.json(
          { error: 'Draft changed. Refresh and try again.' },
          { status: 409 },
        );
      out = jsonb({
        ...body,
        record_id: body.recordId,
        record_revision: body.recordRevision,
        revision: (body.revision || 0) + 1,
        updated_at: new Date().toISOString(),
      });
      drafts = drafts.filter((d) => d.id !== body.id);
      drafts.push(out);
      window.__bohQA.drafts = drafts;
      if (qa.failDraftAfterCommit) {
        qa.failDraftAfterCommit = false;
        throw new TypeError('QA simulated lost draft response');
      }
    } else if (url.pathname === '/api/drafts' && body.operation === 'delete') {
      drafts = drafts.filter((d) => d.id !== body.id);
      out = { deleted: true };
      window.__bohQA.drafts = drafts;
    } else if (url.pathname === '/api/record' && method === 'POST') {
      const existing = drafts.find((d) => d.id === body.draftId);
      if (commands.has(body.commandId)) out = commands.get(body.commandId);
      else {
        if (
          body.draftId &&
          (!existing || existing.revision !== body.draftRevision)
        )
          return Response.json(
            { error: 'Draft changed. Refresh and try again.' },
            { status: 409 },
          );
        out = record(body.kind, body.id || body.commandId, body.payload);
        state.records = state.records.filter((r) => r.id !== out.id);
        state.records.push(out);
        commands.set(body.commandId, out);
      }
      drafts = drafts.filter((d) => d.id !== body.draftId);
      window.__bohQA.drafts = drafts;
      if (qa.failAfterCommit) {
        qa.failAfterCommit = false;
        throw new TypeError('QA simulated lost save response');
      }
    } else if (
      (url.pathname === '/api/accounting-worksheets' ||
        url.pathname === '/api/worksheets') &&
      method === 'POST'
    ) {
      if (qa.delayWorksheet)
        await new Promise((resolve) => setTimeout(resolve, qa.delayWorksheet));
      const accounting = url.pathname === '/api/accounting-worksheets';
      const operation = accounting ? body.operation : body.action;
      if (!['preview', 'commit'].includes(operation))
        return Response.json(
          { error: 'QA fixture: unsupported worksheet operation' },
          { status: 400 },
        );
      const suppliedRows = accounting
        ? qa.accountingWorksheetRows
        : qa.worksheetRows;
      if (body.xlsx && !Array.isArray(suppliedRows))
        return Response.json(
          {
            error: 'QA fixture: configure synthetic XLSX rows before this test',
          },
          { status: 400 },
        );
      const rawRows = body.xlsx
        ? structuredClone(suppliedRows)
        : csvRows(body.csv || '');
      const source = accounting && body.kind === 'source';
      const digest =
        'qa-' +
        [
          ...new Uint8Array(
            await crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode(
                JSON.stringify({
                  kind: body.kind,
                  rawRows,
                  metadata: body.metadata,
                }),
              ),
            ),
          ),
        ]
          .map((n) => n.toString(16).padStart(2, '0'))
          .join('');
      if (operation === 'commit' && body.digest !== digest)
        return Response.json(
          { error: 'The worksheet changed. Preview it again.' },
          { status: 409 },
        );
      const rows = rawRows.map((raw, index) => {
        const { entryKey: key, ...payload } = raw;
        if (payload.amount !== undefined)
          payload.amount = Number(payload.amount);
        if (source) payload.externalId = key;
        if (accounting && !source) payload.lines ||= [];
        const commandKey = url.pathname + ':' + body.kind + ':' + key;
        let status = worksheetCommands.has(commandKey)
          ? 'Already imported'
          : 'Ready';
        let error = '';
        if (
          !key ||
          (accounting &&
            (!payload.date || !Number.isSafeInteger(payload.amount)))
        ) {
          status = 'Needs correction';
          error = 'Check the document dates.';
        }
        const item = {
          row: index + 2,
          key: key || '',
          label: payload.title || payload.name || key,
          status,
          payload,
          ...(error ? { error } : {}),
        };
        if (operation === 'commit' && status === 'Ready') {
          const id = 'qa-worksheet-' + crypto.randomUUID();
          item.status = 'Saved';
          item.id = id;
          worksheetCommands.set(commandKey, id);
          if (source)
            accountingSources.push({
              id,
              external_id: key,
              document_date: payload.date,
              amount: payload.amount,
              source: body.metadata.source,
              dataset: body.metadata.dataset,
              view_name: body.metadata.view,
              file_name: body.metadata.fileName,
              row_number: index + 1,
              status: 'Needs confirmation',
              possible_duplicates: 0,
              raw: payload,
            });
          else if (accounting)
            accountingDocuments.push({
              id,
              ...payload,
              status: 'Draft',
              revision: 1,
              paid: 0,
            });
          else state.records.push(record(body.kind, id, payload));
        }
        return item;
      });
      out = {
        rows,
        count: rows.length,
        digest,
        ...(operation === 'commit'
          ? {
              committed: true,
              saved: rows.filter((row) => row.status === 'Saved').length,
              skipped: rows.filter((row) => row.status === 'Already imported')
                .length,
              failed: rows.filter((row) => row.status === 'Needs correction')
                .length,
            }
          : {}),
      };
      if (operation === 'commit' && qa.failWorksheetAfterCommit) {
        qa.failWorksheetAfterCommit = false;
        throw new TypeError('QA simulated lost worksheet response');
      }
    } else if (
      url.pathname === '/api/accounting' &&
      url.searchParams.get('queue')
    )
      out = { rows: [], total: 0 };
    else if (url.pathname === '/api/accounting' && method === 'GET') {
      const imports = url.searchParams.get('tab') === 'imports';
      const sourceRows = imports ? accountingSources : accountingDocuments;
      const month = url.searchParams.get('month');
      const status = url.searchParams.get('status');
      const filtered = sourceRows.filter(
        (row) =>
          (!month ||
            (imports ? row.document_date : row.date)?.startsWith(month)) &&
          (!status || row.status === status),
      );
      out = {
        rows: filtered,
        total: filtered.length,
        offset: 0,
        pageSize: 50,
        summary: {
          unreviewed: accountingSources.filter(
            (row) => row.status === 'Needs confirmation',
          ).length,
          submitted: 0,
          approved: 1,
        },
        month: date.slice(0, 7),
        status: '',
        generatedAt: new Date().toISOString(),
        basis: 'QA operational documents',
      };
    } else if (url.pathname === '/api/accounting' && body.operation === 'pay') {
      bill.paid += body.payload.amount;
      bill.revision++;
      out = { bankVerified: false };
    } else
      return Response.json(
        { error: 'QA fixture: unsupported action blocked' },
        { status: 400 },
      );
    return Response.json(structuredClone(out));
  };
  return 'Synthetic QA fixture installed. API network writes blocked.';
})();

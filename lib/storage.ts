import { env } from 'cloudflare:workers';
import type { DataRecord } from './types';

export class StorageError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}
// This module is imported only by server routes. Never import it in client UI.
export async function storeCall(
  operation: string,
  args: Record<string, unknown> = {},
) {
  const url = env.SUPABASE_URL,
    key = env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new StorageError(
      'The private database connection has not been configured.',
      503,
    );
  const response = await fetch(
    url.replace(/\/$/, '') +
      '/rest/v1/rpc/' +
      (operation === 'link_student_record' ? 'boh_student_link' : 'boh_store'),
    {
      method: 'POST',
      headers: {
        apikey: key,
        'Content-Type': 'application/json',
        ...(key.startsWith('eyJ') ? { Authorization: 'Bearer ' + key } : {}),
      },
      body: JSON.stringify(
        operation === 'link_student_record' ? { args } : { operation, args },
      ),
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    },
  );
  const data: any = await response.json();
  if (!response.ok) {
    const status =
      data?.code === '40001' || data?.code === '23505'
        ? 409
        : data?.code === '42501'
          ? 403
          : data?.code === 'P0001'
            ? 400
            : 502;
    throw new StorageError(
      status === 409
        ? 'Someone updated this record. Refresh and try again.'
        : status === 403
          ? 'Your role cannot perform this action.'
          : status === 400
            ? data.message
            : 'The database request failed. Please retry.',
      status,
    );
  }
  return data;
}
export function decodeRecord(r: any): DataRecord {
  return {
    id: r.id,
    kind: r.kind,
    classId: r.class_id,
    studentId: r.student_id,
    date: r.date,
    payload: r.payload,
    revision: r.revision,
    updatedAt: r.updated_at,
  };
}
export async function findRecord(id: string) {
  const r = await storeCall('get_record', { id });
  return r ? decodeRecord(r) : null;
}
export async function listRecords() {
  const all: DataRecord[] = [];
  for (let offset = 0; ; offset += 900) {
    const rows: any[] = await storeCall('list_records', { offset, limit: 900 });
    all.push(...rows.map(decodeRecord));
    if (rows.length < 900) return all;
  }
}

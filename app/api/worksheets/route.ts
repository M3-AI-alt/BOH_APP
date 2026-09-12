import { actor, body, failure, response, AppError } from '@/lib/server';
import {
  bulkPreview,
  bulkCommit,
  exportRecords,
  referenceCsv,
} from '@/lib/bulk-server';
import { canImport, templateCsv } from '@/lib/bulk';
import { readWorksheet } from '@/lib/worksheet-file';
export async function POST(request: Request) {
  try {
    const a = await actor();
    const input = await body(request, 2_800_000);
    if (!canImport(a, input.kind))
      return response(
        { error: 'Your role cannot import this worksheet.' },
        403,
      );
    let csv: string;
    try {
      csv = input.xlsx
        ? await readWorksheet(String(input.xlsx))
        : String(input.csv ?? '');
    } catch (e) {
      throw new AppError(e instanceof Error ? e.message : 'Invalid worksheet.');
    }
    if (input.action === 'preview')
      return response(await bulkPreview(a, input.kind, csv));
    if (input.action === 'commit')
      return response(await bulkCommit(a, input.kind, csv, input.digest));
    return response({ error: 'Choose preview or commit.' }, 400);
  } catch (e) {
    return failure(e);
  }
}
export async function GET(request: Request) {
  try {
    const a = await actor(),
      params = new URL(request.url).searchParams;
    const kind = params.get('kind') || 'student',
      action = params.get('action');
    let csv: string;
    if (action === 'references') csv = await referenceCsv(a);
    else if (action === 'template') {
      if (!canImport(a, kind))
        return response(
          { error: 'Your role cannot import this worksheet.' },
          403,
        );
      csv = templateCsv(kind);
    } else
      csv = await exportRecords(
        a,
        kind,
        params.get('month') || '',
        params.get('classId') || '',
      );
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="BOH-${action === 'references' ? 'references' : kind}-${action === 'template' ? 'template' : 'export'}.csv"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        Vary: 'Cookie',
      },
    });
  } catch (e) {
    return failure(e);
  }
}

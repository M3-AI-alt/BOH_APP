import {
  actor,
  body,
  failure,
  response,
  requireRole,
  AppError,
} from '@/lib/server';
import { accountingWorksheet } from '@/lib/accounting-worksheet-server';
import {
  accountingWorksheetKind,
  accountingWorksheetTemplate,
} from '@/lib/accounting-worksheets';

export async function GET(request: Request) {
  try {
    requireRole(await actor(), ['Director', 'Finance']);
    let kind;
    try {
      kind = accountingWorksheetKind(
        new URL(request.url).searchParams.get('kind'),
      );
    } catch (e) {
      throw new AppError(
        e instanceof Error ? e.message : 'Choose an accounting worksheet.',
      );
    }
    return new Response(accountingWorksheetTemplate(kind), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="BOH-accounting-${kind}-template.csv"`,
        'Cache-Control': 'private, no-store',
        Vary: 'Cookie',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    return response(
      await accountingWorksheet(await actor(), await body(request, 2_800_000)),
    );
  } catch (e) {
    return failure(e);
  }
}

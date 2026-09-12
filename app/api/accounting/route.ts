import { actor, body, response, failure } from '@/lib/server';
import { accountingCommand, listAccounting } from '@/lib/accounting-server';
export async function GET(request: Request) {
  try {
    return response(
      await listAccounting(await actor(), new URL(request.url).searchParams),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const a = await actor();
    return response(await accountingCommand(a, await body(request, 1_500_000)));
  } catch (e) {
    return failure(e);
  }
}

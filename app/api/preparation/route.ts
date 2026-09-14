import { actor, body, response, failure } from '@/lib/server';
import { listPreparation, preparationCommand } from '@/lib/preparation-server';
export async function GET(request: Request) {
  try {
    return response(
      await listPreparation(await actor(), new URL(request.url).searchParams),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const a = await actor();
    return response(
      await preparationCommand(a, await body(request, 2_800_000)),
    );
  } catch (e) {
    return failure(e);
  }
}

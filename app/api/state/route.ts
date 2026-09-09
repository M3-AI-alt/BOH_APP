import { actor, snapshot, response, failure } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return response(await snapshot(await actor()));
  } catch (e) {
    return failure(e);
  }
}

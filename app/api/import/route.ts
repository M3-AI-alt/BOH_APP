import { actor, body, importChunk, response, failure } from '@/lib/server';
export async function POST(request: Request) {
  try {
    await body(request);
    return response(await importChunk(await actor()));
  } catch (e) {
    return failure(e);
  }
}

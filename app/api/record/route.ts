import { actor, body, saveRecord, response, failure } from '@/lib/server';
export async function POST(request: Request) {
  try {
    const a = await actor();
    return response(await saveRecord(a, await body(request)));
  } catch (e) {
    return failure(e);
  }
}

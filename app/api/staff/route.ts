import { actor, body, saveStaff, response, failure } from '@/lib/server';
export async function POST(request: Request) {
  try {
    return response(await saveStaff(await actor(), await body(request)));
  } catch (e) {
    return failure(e);
  }
}

import { actor, body, response, failure, studentAction } from '@/lib/server';
export async function POST(request: Request) {
  try {
    return response(await studentAction(await actor(), await body(request)));
  } catch (e) {
    return failure(e);
  }
}

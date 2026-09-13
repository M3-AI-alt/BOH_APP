import { actor, body, failure, response } from '@/lib/server';
import { draftCommand, listDrafts } from '@/lib/drafts-server';
export async function GET() {
  try {
    return response(await listDrafts(await actor()));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const a = await actor();
    return response(await draftCommand(a, await body(request)));
  } catch (e) {
    return failure(e);
  }
}

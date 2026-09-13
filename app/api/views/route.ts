import { actor, body, failure, response } from '@/lib/server';
import { savedViews, savedViewCommand } from '@/lib/saved-views-server';
export async function GET(request: Request) {
  try {
    return response(
      await savedViews(
        await actor(),
        new URL(request.url).searchParams.get('module') || '',
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    return response(await savedViewCommand(await actor(), await body(request)));
  } catch (e) {
    return failure(e);
  }
}

import { actor, sourceRows, response, failure } from '@/lib/server';
export async function GET(request: Request) {
  try {
    return response(
      await sourceRows(
        await actor(),
        new URL(request.url).searchParams.get('q') ?? '',
      ),
    );
  } catch (e) {
    return failure(e);
  }
}

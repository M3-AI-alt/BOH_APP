import { actor, body, saveRecord, response, failure } from '@/lib/server';
import { entryErrors } from '@/lib/entry-experience';
import { canWrite } from '@/lib/domain';
export async function POST(request: Request) {
  try {
    const a = await actor();
    const input = await body(request);
    if (!canWrite(a, input?.kind, input?.payload?.classId || ''))
      return response({ error: 'Your role cannot edit this record.' }, 403);
    if (
      input &&
      typeof input.kind === 'string' &&
      input.payload &&
      typeof input.payload === 'object' &&
      !Array.isArray(input.payload)
    ) {
      const fieldErrors = entryErrors(input.kind, input.payload);
      if (Object.keys(fieldErrors).length)
        return response(
          { error: 'Please check the highlighted information.', fieldErrors },
          400,
        );
    }
    return response(await saveRecord(a, input));
  } catch (e) {
    return failure(e);
  }
}

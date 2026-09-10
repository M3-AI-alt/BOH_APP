import {
  actor,
  body,
  response,
  failure,
  linkStudentRecord,
} from '@/lib/server';
export async function POST(request: Request) {
  try {
    return response(
      await linkStudentRecord(await actor(), await body(request)),
    );
  } catch (e) {
    return failure(e);
  }
}

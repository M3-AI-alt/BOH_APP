// Public source contains no real students, receipts or financial control totals.
// The build uses the ignored db/import.json only when privately supplied.
const seed = {
  manifest: {
    cutoff: '2026-09-08',
    counts: {} as Record<string, number>,
    monthlyCollections: {} as Record<string, number>,
    sources: [] as { name: string; sha256: string }[],
    version: 'unconfigured',
  },
  records: [] as {
    id: string;
    kind: string;
    classId: string;
    studentId: string;
    date: string;
    payload: Record<string, any>;
  }[],
};
export default seed;

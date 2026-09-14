/** Scalars accepted in protected source cells and proposed entry cells. */
export type PreparationScalar = string | number | boolean;
export type PreparationValues = Record<string, PreparationScalar>;

export type PreparationField = {
  key: string;
  label: string;
  type: string;
  choices?: string[];
  reference?: string;
};
export type PreparationModule = {
  key: string;
  sheet: string;
  inputs: PreparationField[];
  original: PreparationField[];
};
export type PreparationSourceRow = {
  ref: string;
  existing: boolean;
  original: PreparationValues;
  recordId?: string;
  revision?: number;
};
export type PreparationBaseline = {
  version: string;
  capturedAt: string;
  sourceFingerprint: string;
  tables: Record<string, { rows: PreparationSourceRow[] }>;
  classes: { id: string }[];
  controlTotals: {
    augustCollections: number;
    januaryToMayExpenses: number[];
  };
};
export type PreparationSubmission = {
  ref: string;
  line: number;
  cells: PreparationValues;
};
export type PreparationSubmissions = Record<string, PreparationSubmission[]>;
export type PreparationStatus =
  | 'Unchanged'
  | 'Addition'
  | 'Proposed correction'
  | 'Conflict'
  | 'Needs information'
  | 'Invalid'
  | 'Not applicable';
export type PreparationRow = {
  module: string;
  sheet: string;
  ref: string;
  line: number;
  name: string;
  status: PreparationStatus;
  reviewed: boolean;
  decision: string;
  issues: string[];
  proposed: PreparationValues;
  original: PreparationValues;
  recordId?: string;
  recordRevision?: number;
  currentRevision?: number;
  effect: string;
};
export type PreparationReport = {
  sourceDate: string;
  sourceFingerprint: string;
  rows: PreparationRow[];
  counts: Partial<Record<PreparationStatus, number>>;
  unreviewed: number;
  financialChanges: 0;
  controlTotals: PreparationBaseline['controlTotals'];
};
export type PreparationSavedReview = {
  id: string;
  digest: string;
  file_hash: string;
  file_name: string;
  owner_id: string;
  created_at: string;
  payload: PreparationReport;
};
export type PreparationSaveResult = {
  id: string;
  saved: true;
  reused: boolean;
  financialChanges: 0;
};
export type PreparationHistoryRow = Pick<
  PreparationSavedReview,
  'id' | 'file_name' | 'owner_id' | 'created_at'
> & {
  counts: PreparationReport['counts'];
  source_date: string;
};
export type PreparationHistoryPage = {
  rows: PreparationHistoryRow[];
  total: number;
};

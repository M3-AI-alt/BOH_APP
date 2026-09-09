export type Role = 'Director' | 'Finance' | 'TA';
export type RecordKind =
  | 'class'
  | 'student'
  | 'membership'
  | 'attendance'
  | 'package'
  | 'receipt'
  | 'expense'
  | 'makeup'
  | 'support'
  | 'lead'
  | 'commitment'
  | 'source'
  | 'unmatched'
  | 'calendar'
  | 'close'
  | 'reconciliation'
  | 'payroll'
  | 'task';
export type DataRecord = {
  id: string;
  kind: RecordKind;
  classId: string;
  studentId: string;
  date: string;
  payload: any;
  revision: number;
  updatedAt: string;
};
export type Actor = {
  userId: string;
  email: string;
  name: string;
  role: Role;
  classIds: string[];
  active: boolean;
};
export type Snapshot = {
  actor: Actor;
  records: DataRecord[];
  members: any[];
  activity: any[];
  manifest: any;
  loadedAt: string;
};
export const priceList = [
  { sessions: 24, price: 6600000 },
  { sessions: 48, price: 12000000 },
  { sessions: 96, price: 21600000 },
  { sessions: 192, price: 36000000 },
  { sessions: 288, price: 50400000 },
];
export const CUTOFF = '2026-09-08';

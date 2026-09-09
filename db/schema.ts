import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
export const records = sqliteTable(
  'records',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    classId: text('class_id').notNull().default(''),
    studentId: text('student_id').notNull().default(''),
    date: text('date').notNull().default(''),
    payload: text('payload').notNull(),
    revision: integer('revision').notNull().default(1),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('idx_records_kind_date').on(t.kind, t.date),
    index('idx_records_class_kind').on(t.classId, t.kind),
    index('idx_records_student_kind').on(t.studentId, t.kind),
  ],
);
export const staff = sqliteTable(
  'staff',
  {
    id: text('id').primaryKey(),
    userId: text('user_id'),
    email: text('email').notNull(),
    name: text('name').notNull(),
    role: text('role').notNull(),
    classIds: text('class_ids').notNull().default('[]'),
    active: integer('active').notNull().default(1),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_staff_user').on(t.userId),
    uniqueIndex('idx_staff_email').on(t.email),
  ],
);
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
export const activity = sqliteTable(
  'activity',
  {
    id: text('id').primaryKey(),
    at: text('at').notNull(),
    actorId: text('actor_id').notNull(),
    actorName: text('actor_name').notNull(),
    action: text('action').notNull(),
    recordId: text('record_id').notNull(),
    before: text('before'),
    after: text('after'),
  },
  (t) => [index('idx_activity_at').on(t.at)],
);

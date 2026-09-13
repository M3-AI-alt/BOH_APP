import type { Role } from './types';

export type NavigationTarget = {
  month?: string;
  tab?: string;
  classId?: string;
  status?: string;
  documentId?: string;
};
export const workspaceAreas = [
  { label: 'Today', views: ['Today'] },
  { label: 'People', views: ['Students', 'Leads', 'Packages', 'Renewals'] },
  { label: 'Classes', views: ['Attendance', 'Classes & catalogue'] },
  { label: 'Money', views: ['Finance', 'Accounting'] },
  {
    label: 'More',
    views: [
      'Overview',
      'My drafts',
      'Import & export',
      'Team & access',
      'Original records',
    ],
  },
] as const;

export function allowedViews(role: Role): string[] {
  const all = workspaceAreas.flatMap((area) => [...area.views]);
  if (role === 'TA')
    return all.filter((view) =>
      ['Today', 'Attendance', 'Import & export'].includes(view),
    );
  if (role === 'Finance')
    return all.filter((view) => !['Leads', 'Team & access'].includes(view));
  return role === 'Director' ? all : [];
}

export function areaFor(view: string) {
  return (
    workspaceAreas.find((area) =>
      (area.views as readonly string[]).includes(view),
    )?.label ?? 'Today'
  );
}

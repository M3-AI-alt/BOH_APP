'use client';
import { Button } from '@/components/ui/button';
import { Panel, DataTable, ClassTag, Badge } from './ui';
import { useLanguage } from './language';
import { entries } from '@/lib/domain';
import { priceList } from '@/lib/types';
import type { ViewProps } from './views';
export function CentreSettings(p: ViewProps) {
  const { t, money } = useLanguage(),
    classes = entries(p.snapshot.records, 'class'),
    catalogue = entries(p.snapshot.records, 'catalogue');
  const days = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];
  return (
    <>
      <Panel
        title={t('Class settings')}
        subtitle={t(
          'Class names, colours and weekly timetables are shared across the workspace.',
        )}
        action={
          p.snapshot.actor.role === 'Director' && (
            <Button onClick={() => p.open('class')}>{t('Add class')}</Button>
          )
        }
      >
        <DataTable
          headings={['Class', 'Lesson weekdays', 'Status', 'Review / actions']}
          rows={classes.map((c) => [
            <ClassTag cl={c} />,
            (c.weekdays || []).map((n: number) => t(days[n])).join(' · '),
            <Badge tone={c.archived ? 'grey' : 'green'}>
              {t(c.archived ? 'Archived' : 'Active')}
            </Badge>,
            p.snapshot.actor.role === 'Director' ? (
              <Button
                variant="outline"
                onClick={() =>
                  p.open(
                    'class',
                    p.snapshot.records.find((r) => r.id === c.id),
                  )
                }
              >
                {t('Edit')}
              </Button>
            ) : (
              t('Read-only')
            ),
          ])}
        />
      </Panel>
      <Panel
        title={t('Package catalogue')}
        subtitle={t(
          'Catalogue changes apply only to new agreements. Purchased packages retain their agreed fees and session counts.',
        )}
        action={
          <Button onClick={() => p.open('catalogue')}>
            {t('Add catalogue package')}
          </Button>
        }
      >
        <DataTable
          headings={[
            'Package',
            'Sessions',
            'Catalogue price (VND)',
            'Status',
            'Review / actions',
          ]}
          rows={(catalogue.length ? catalogue : priceList).map((c: any) => [
            c.label || t('Standard package'),
            c.sessions,
            money(c.price),
            <Badge tone={c.active === false ? 'grey' : 'green'}>
              {t(c.active === false ? 'Archived' : 'Active')}
            </Badge>,
            c.id ? (
              <Button
                variant="outline"
                onClick={() =>
                  p.open(
                    'catalogue',
                    p.snapshot.records.find((r) => r.id === c.id),
                  )
                }
              >
                {t('Edit')}
              </Button>
            ) : (
              t('Published price list')
            ),
          ])}
        />
      </Panel>
    </>
  );
}

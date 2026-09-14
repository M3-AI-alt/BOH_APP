'use client';

import { useState } from 'react';
import { FileSpreadsheet, Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { bulkTasks, canImport } from '@/lib/bulk';
import { BulkWorkspace } from './bulk-workspace';
import { useLanguage } from './language';
import type { ViewProps } from './views';

/** The same validated worksheet workflow, opened beside its actual records. */
export function EntryActions({
  kind,
  manualLabel = 'Add manually',
  defaults,
  onManual,
  context,
  ...p
}: ViewProps & {
  kind: string;
  manualLabel?: string;
  defaults?: Record<string, unknown>;
  onManual?: () => void;
  context?: string;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ pending: false, busy: false });
  if (!canImport(p.snapshot.actor, kind)) return null;
  const label = bulkTasks[kind].label;
  function changeOpen(next: boolean) {
    if (!next && state.busy) return;
    if (
      !next &&
      state.pending &&
      !window.confirm(
        t(
          'Close this import? Unsaved review changes will be discarded. Your worksheet and any saved records are kept.',
        ),
      )
    )
      return;
    setOpen(next);
    if (!next) setState({ pending: false, busy: false });
  }
  return (
    <div className="entry-actions" role="group" aria-label={t(label)}>
      <Button onClick={onManual || (() => p.open(kind, undefined, defaults))}>
        <Plus size={16} /> {t(manualLabel)}
      </Button>
      <a
        className="bulk-link"
        href={'/templates/BOH-' + kind + '.xlsx'}
        download
      >
        <FileSpreadsheet size={16} /> {t('Download worksheet sample')}
      </a>
      <Button variant="outline" onClick={() => changeOpen(true)}>
        <Upload size={16} /> {t('Import completed worksheet')}
      </Button>
      {context && <span className="entry-context">{context}</span>}
      <Sheet open={open} onOpenChange={changeOpen}>
        <SheetContent className="entry-import-sheet">
          <SheetHeader>
            <SheetTitle>
              {t('Import completed worksheet')} · {t(label)}
            </SheetTitle>
            <SheetDescription>
              {t(
                'Download the sample, fill its Entry sheet, then upload it here. Review every row before saving.',
              )}
            </SheetDescription>
          </SheetHeader>
          <div className="entry-import-body">
            {open && (
              <BulkWorkspace
                {...p}
                focusedTask={kind}
                onImportStateChange={setState}
              />
            )}
            {state.busy && (
              <p role="status">
                {t(
                  'Please wait for this import request to finish before closing.',
                )}
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

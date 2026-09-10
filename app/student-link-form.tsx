'use client';
import { useLanguage } from '@/app/language';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Picker } from './ui';
import { entries, resolveStudentId } from '@/lib/domain';
import type { DataRecord } from '@/lib/types';
export default function StudentLinkForm({
  record,
  records,
  onClose,
  onSaved,
}: {
  record: DataRecord;
  records: DataRecord[];
  onClose: () => void;
  onSaved: (record: DataRecord) => Promise<void>;
}) {
  const { t, message } = useLanguage();
  const [studentId, setStudentId] = useState(''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const classes = entries(records, 'class');
  const students = entries(records, 'student').filter(
    (s) => resolveStudentId(records, s.id) === s.id,
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/student-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: record.id,
          revision: record.revision,
          studentId,
          reason,
        }),
      });
      const result = (await r.json()) as any;
      if (!r.ok) throw new Error(result.error || 'Could not link this record.');
      await onSaved(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not link this record.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Match original lesson to a student')}</DialogTitle>
          <DialogDescription>
            {t(
              "This connects the existing record to the student's profile. It does not add a lesson, change attendance or deduct sessions.",
            )}
          </DialogDescription>
        </DialogHeader>
        <p className="source-note-text">
          {record.payload.source}
          <br />
          {record.payload.original?.map((v: any) => v ?? '—').join(' · ')}
        </p>
        <form onSubmit={save} className="form-grid">
          <div className="form-field wide">
            <label htmlFor="link-student">{t('Confirmed student')}</label>
            <Picker
              id="link-student"
              label={t('Choose the matching student')}
              value={studentId}
              onChange={setStudentId}
              options={students.map((s) => ({
                id: s.id,
                label:
                  s.name +
                  ' · ' +
                  (classes.find((c) => c.id === s.classId)?.name || s.id),
              }))}
            />
          </div>
          <div className="form-field wide">
            <label htmlFor="link-evidence">
              {t('How did you confirm the match?')}
            </label>
            <textarea
              id="link-evidence"
              required
              minLength={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t(
                'For example: checked full name and parent in the original class roster.',
              )}
            />
          </div>
          {error && (
            <p className="error-message wide" role="alert">
              {message(error)}
            </p>
          )}
          <DialogFooter className="wide">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              {t('Cancel')}
            </Button>
            <Button
              type="submit"
              disabled={busy || !studentId || reason.trim().length < 3}
            >
              {busy ? t('Linking…') : t('Confirm student match')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

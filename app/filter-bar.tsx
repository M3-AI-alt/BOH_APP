'use client';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from './language';
import { Choice } from './ui';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  emptyFilters,
  moduleAllowed,
  validateFilters,
  type FilterSpec,
} from '@/lib/record-filters';
import type { Actor } from '@/lib/types';
type Facet = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
};
type SavedView = {
  id: string;
  owner_id: string;
  name: string;
  revision: number;
  spec: FilterSpec;
};
function apiError(value: unknown, fallback: string) {
  return value &&
    typeof value === 'object' &&
    'error' in value &&
    typeof value.error === 'string'
    ? value.error
    : fallback;
}
function savedView(module: string, value: unknown): SavedView {
  if (!value || typeof value !== 'object') throw Error('Check the saved view.');
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'string' ||
    typeof row.owner_id !== 'string' ||
    typeof row.name !== 'string' ||
    typeof row.revision !== 'number'
  )
    throw Error('Check the saved view.');
  return {
    id: row.id,
    owner_id: row.owner_id,
    name: row.name,
    revision: row.revision,
    spec: validateFilters(module, row.spec),
  };
}
export function FilterBar({
  module,
  actor,
  value,
  onChange,
  facets,
  count,
  columns = [],
}: {
  module: string;
  actor: Actor;
  value: FilterSpec;
  onChange: (v: FilterSpec) => void;
  facets: Facet[];
  count: number;
  columns?: { key: string; label: string }[];
}) {
  const { t, message } = useLanguage();
  const [response, setResponse] = useState<{
    key: string;
    rows: SavedView[];
    error: string;
  }>({ key: '', rows: [], error: '' });
  const [reload, setReload] = useState(0),
    [selected, setSelected] = useState(''),
    [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false),
    [name, setName] = useState(''),
    [roles, setRoles] = useState<string[]>([]),
    [error, setError] = useState('');
  const saveCommand = useRef({ key: '', id: '' });
  const key = [actor.userId, actor.role, module, reload].join(':');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/views?module=' + encodeURIComponent(module), {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (r) => {
        const data: unknown = await r.json();
        if (!r.ok) throw Error(apiError(data, 'Saved views are unavailable.'));
        if (!Array.isArray(data)) throw Error('Saved views are unavailable.');
        setResponse({
          key,
          rows: data.map((row: unknown) => savedView(module, row)),
          error: '',
        });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setResponse({ key, rows: [], error: e.message });
      });
    return () => controller.abort();
  }, [key, module]);
  const rows = response.key === key ? response.rows : [];
  const update = (next: FilterSpec) => {
    setSelected('');
    onChange(next);
  };
  const toggle = (facet: string, item: string) => {
    const list = value.facets[facet] || [];
    update({
      ...value,
      facets: {
        ...value.facets,
        [facet]: list.includes(item)
          ? list.filter((x) => x !== item)
          : [...list, item],
      },
    });
  };
  async function saveView() {
    setSaving(true);
    setError('');
    try {
      const key = JSON.stringify({ module, name, roles, spec: value });
      if (saveCommand.current.key !== key)
        saveCommand.current = { key, id: crypto.randomUUID() };
      const r = await fetch('/api/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'save',
          module,
          id: saveCommand.current.id,
          name,
          roles,
          spec: value,
        }),
      });
      const data: unknown = await r.json();
      if (!r.ok) throw Error(apiError(data, 'Could not save view.'));
      setSelected(savedView(module, data).id);
      setEditing(false);
      setReload((r) => r + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save view.');
    } finally {
      setSaving(false);
    }
  }
  const chosen = rows.find((v) => v.id === selected);
  const quick = facets
    .flatMap((facet) =>
      facet.options
        .filter((option) =>
          ['unmatched', 'overdue', 'missing', 'completed'].includes(
            option.value,
          ),
        )
        .map((option) => ({ ...option, key: facet.key })),
    )
    .slice(0, 3);
  async function removeView() {
    if (!chosen) return;
    setSaving(true);
    setError('');
    try {
      const r = await fetch('/api/views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'delete',
          module,
          id: chosen.id,
          revision: chosen.revision,
        }),
      });
      const data: unknown = await r.json();
      if (!r.ok) throw Error(apiError(data, 'Could not remove view.'));
      setSelected('');
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove view.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="record-filter-bar" aria-label={t('Filter records')}>
      <div className="filter-main">
        <label className="filter-search">
          {t('Search')}
          <input
            type="search"
            value={value.query}
            onChange={(e) => update({ ...value, query: e.target.value })}
            placeholder={t('Search names, references or descriptions…')}
          />
        </label>
        <Choice
          label="Saved views"
          value={selected}
          onChange={(id) => {
            const view = rows.find((r) => r.id === id);
            if (view) {
              try {
                onChange(validateFilters(module, view.spec));
                setSelected(id);
                setError('');
              } catch {
                setError('This view needs to be saved again.');
              }
            }
          }}
          options={[
            { value: '', label: t('Current filters') },
            ...rows.map((r) => ({ value: r.id, label: r.name })),
          ]}
        />
        <Button
          variant="outline"
          onClick={() => {
            setName('');
            setRoles([]);
            setEditing(true);
          }}
        >
          {t('Save view')}
        </Button>
        <Button variant="ghost" onClick={() => update(emptyFilters())}>
          {t('Reset filters')}
        </Button>
        <output aria-live="polite">
          {count} {t('matching records')}
        </output>
      </div>
      {!!quick.length && (
        <div className="filter-chips filter-quick">
          {quick.map((option) => (
            <Button
              key={option.key + option.value}
              variant="outline"
              size="sm"
              aria-pressed={(value.facets[option.key] || []).includes(
                option.value,
              )}
              onClick={() => toggle(option.key, option.value)}
            >
              {t(option.label)}
            </Button>
          ))}
        </div>
      )}
      <details className="filter-details">
        <summary>
          {t('More filters')}
          {columns.length ? ' · ' + t('Columns') : ''}
        </summary>
        <div className="filter-facets">
          {facets.map((facet) => (
            <fieldset key={facet.key}>
              <legend>{t(facet.label)}</legend>
              {facet.options.map((option) => (
                <label key={option.value}>
                  <Checkbox
                    checked={(value.facets[facet.key] || []).includes(
                      option.value,
                    )}
                    onCheckedChange={() => toggle(facet.key, option.value)}
                  />
                  {t(option.label)}
                </label>
              ))}
            </fieldset>
          ))}
          {!!columns.length && (
            <fieldset>
              <legend>{t('Columns')}</legend>
              {columns.map((column) => {
                const visible = value.columns.length
                  ? value.columns
                  : columns.map((c) => c.key);
                return (
                  <label key={column.key}>
                    <Checkbox
                      checked={visible.includes(column.key)}
                      disabled={
                        visible.length === 1 && visible.includes(column.key)
                      }
                      onCheckedChange={() =>
                        update({
                          ...value,
                          columns: visible.includes(column.key)
                            ? visible.filter((c) => c !== column.key)
                            : [...visible, column.key],
                        })
                      }
                    />
                    {t(column.label)}
                  </label>
                );
              })}
            </fieldset>
          )}
        </div>
      </details>
      <div className="filter-chips">
        {Object.entries(value.facets).flatMap(([key, values]) =>
          values.map((item) => (
            <Button
              key={key + item}
              variant="outline"
              size="sm"
              onClick={() => toggle(key, item)}
              aria-label={
                t('Remove filter') +
                ': ' +
                t(
                  facets
                    .find((f) => f.key === key)
                    ?.options.find((o) => o.value === item)?.label || item,
                )
              }
            >
              {t(facets.find((f) => f.key === key)?.label || key)}:{' '}
              {t(
                facets
                  .find((f) => f.key === key)
                  ?.options.find((o) => o.value === item)?.label || item,
              )}{' '}
              ×
            </Button>
          )),
        )}
      </div>
      {chosen?.owner_id === actor.userId && (
        <details>
          <summary>{t('Manage saved view')}</summary>
          <p>{t('Removing a saved view does not delete any records.')}</p>
          <Button disabled={saving} variant="outline" onClick={removeView}>
            {t('Remove saved view')}
          </Button>
        </details>
      )}
      {(error || (response.key === key && response.error)) && (
        <output className="field-help">
          {message(error || response.error)}{' '}
          {t('Your current filters still work.')}
        </output>
      )}
      <Dialog
        open={editing}
        onOpenChange={(v) => {
          if (!saving) setEditing(v);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Save view')}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void saveView();
            }}
          >
            <label>
              {t('View name')}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
                placeholder={t('For example: Unmatched payments')}
              />
            </label>
            <p className="field-help">
              {t('Filters and columns are saved, not copies of your records.')}
            </p>
            {actor.role === 'Director' && (
              <fieldset className="class-checks">
                <legend>{t('Share with roles (optional)')}</legend>
                {['Director', 'Finance', 'TA']
                  .filter((role) => moduleAllowed(module, role))
                  .map((role) => (
                    <label key={role}>
                      <Checkbox
                        checked={roles.includes(role)}
                        onCheckedChange={() =>
                          setRoles(
                            roles.includes(role)
                              ? roles.filter((r) => r !== role)
                              : [...roles, role],
                          )
                        }
                      />
                      {t(role)}
                    </label>
                  ))}
              </fieldset>
            )}
            {error && <p role="alert">{message(error)}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setEditing(false)}
              >
                {t('Cancel')}
              </Button>
              <Button type="submit" disabled={saving}>
                {t(saving ? 'Saving…' : 'Save view')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

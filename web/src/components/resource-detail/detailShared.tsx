import { SearchOutlined } from '@ant-design/icons';
import { Input, Typography } from 'antd';
import { type ReactNode, useDeferredValue, useMemo, useState } from 'react';

export function SectionCard({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <Typography.Title level={4} className="!mb-0 !text-[16px]">
          {title}
        </Typography.Title>
        {extra ?? null}
      </div>
      {children}
    </section>
  );
}

export function InlineStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[14px] border border-slate-200 bg-white px-3 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-[13px] font-semibold leading-5 text-slate-900">{value}</div>
    </div>
  );
}

export function ContextRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-3.5 py-2.5">
      <span className="shrink-0 text-[12px] font-medium text-slate-500">{label}</span>
      <span className="break-all text-right text-[13px] font-medium leading-5 text-slate-900">
        {value}
      </span>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[16px] border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-500">
      {message}
    </div>
  );
}

export function HeaderMeta({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-600">{value}</span>
    </div>
  );
}

export function SearchableKeyList({
  items,
  emptyMessage,
  searchPlaceholder = 'Search keys',
}: {
  items: string[];
  emptyMessage: string;
  searchPlaceholder?: string;
}) {
  const [keyword, setKeyword] = useState('');
  const deferredKeyword = useDeferredValue(keyword.trim().toLowerCase());

  const filteredItems = useMemo(() => {
    if (!deferredKeyword) {
      return items;
    }

    return items.filter((item) => item.toLowerCase().includes(deferredKeyword));
  }, [deferredKeyword, items]);

  if (items.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <Input
          allowClear
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          prefix={<SearchOutlined className="text-slate-400" />}
          placeholder={searchPlaceholder}
          className="md:max-w-[320px]"
        />
        <div className="text-xs text-slate-500">
          {filteredItems.length === items.length
            ? `${items.length} items`
            : `${filteredItems.length} / ${items.length} items`}
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px] border border-slate-200 bg-white">
        {filteredItems.length > 0 ? (
          <div className="max-h-[320px] divide-y divide-slate-100 overflow-auto">
            {filteredItems.map((item) => (
              <div key={item} className="px-3.5 py-2.5 transition hover:bg-slate-50">
                <Typography.Text className="!mb-0 font-mono text-[12px] leading-5 text-slate-700">
                  {item}
                </Typography.Text>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-10 text-sm text-slate-500">No matching keys.</div>
        )}
      </div>
    </div>
  );
}

import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { ProTable, type ProColumns } from '@ant-design/pro-components';
import { Button, Empty, Input, Space, Typography, type TableProps } from 'antd';
import { type Key, type ReactNode, useDeferredValue, useMemo, useState } from 'react';

type MetricTone = 'teal' | 'blue' | 'amber' | 'slate';

export type ResourceMetric = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: MetricTone;
};

type ResourceListPageProps<T extends object> = {
  title: string;
  description: string;
  metrics?: ResourceMetric[];
  dataSource: T[];
  columns: ProColumns<T>[];
  rowKey: string | ((record: T) => Key);
  loading?: boolean;
  onRefresh?: () => void | Promise<unknown>;
  toolbarExtra?: ReactNode;
  searchPlaceholder?: string;
  searchPredicate?: (record: T, keyword: string) => boolean;
  emptyDescription?: string;
  onRow?: TableProps<T>['onRow'];
  paginationPageSize?: number;
};

const metricToneClasses: Record<MetricTone, string> = {
  teal: 'bg-teal-50 text-teal-700 ring-teal-100',
  blue: 'bg-sky-50 text-sky-700 ring-sky-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
};

function ResourceMetricCard({ label, value, hint, tone = 'teal' }: ResourceMetric) {
  return (
    <section className="rounded-[20px] border border-slate-200 bg-white px-4 py-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.05)]">
      <div className="flex items-start gap-3">
        <div
          className={[
            'rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ring-1',
            metricToneClasses[tone],
          ].join(' ')}
        >
          {label}
        </div>
      </div>
      <div className="mt-3 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-slate-950">
        {value}
      </div>
      {hint ? <div className="mt-1.5 text-xs text-slate-500">{hint}</div> : null}
    </section>
  );
}

export function ResourceListPage<T extends object>({
  title,
  description,
  metrics = [],
  dataSource,
  columns,
  rowKey,
  loading,
  onRefresh,
  toolbarExtra,
  searchPlaceholder = '搜索资源',
  searchPredicate,
  emptyDescription = '当前没有可展示的数据',
  onRow,
  paginationPageSize = 10,
}: ResourceListPageProps<T>) {
  const [keyword, setKeyword] = useState('');
  const deferredKeyword = useDeferredValue(keyword.trim().toLowerCase());

  const filteredData = useMemo(() => {
    if (!deferredKeyword || !searchPredicate) {
      return dataSource;
    }

    return dataSource.filter((record) => searchPredicate(record, deferredKeyword));
  }, [dataSource, deferredKeyword, searchPredicate]);

  return (
    <section className="space-y-4">
      {metrics.length > 0 ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <ResourceMetricCard key={metric.label} {...metric} />
          ))}
        </section>
      ) : null}

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Typography.Title level={4} className="!mb-1">
              {title}
            </Typography.Title>
            <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
              {description}
            </Typography.Paragraph>
          </div>

          <Space size={10} wrap className="justify-end">
            <Input
              allowClear
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              prefix={<SearchOutlined className="text-slate-400" />}
              placeholder={searchPlaceholder}
              style={{ width: 280 }}
            />
            {toolbarExtra}
            <Button icon={<ReloadOutlined />} onClick={() => void onRefresh?.()}>
              刷新
            </Button>
          </Space>
        </div>

        <ProTable<T>
          rowKey={rowKey}
          columns={columns}
          dataSource={filteredData}
          loading={loading}
          search={false}
          options={false}
          toolBarRender={false}
          tableAlertRender={false}
          tableAlertOptionRender={false}
          cardBordered={false}
          dateFormatter="string"
          pagination={{
            defaultPageSize: paginationPageSize,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
          }}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<span className="text-sm text-slate-500">{emptyDescription}</span>}
              />
            ),
          }}
          scroll={{ x: 'max-content' }}
          onRow={onRow}
        />
      </section>
    </section>
  );
}

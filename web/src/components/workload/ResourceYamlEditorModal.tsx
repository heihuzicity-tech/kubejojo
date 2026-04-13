import { Alert, Button, Input, Modal, Space, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';

import type { ResourceTextResult } from '../../services/cluster';

type ResourceYamlEditorModalProps = {
  open: boolean;
  title: string;
  resourceKind: string;
  resourceLabel: string;
  result?: ResourceTextResult;
  loading: boolean;
  saving: boolean;
  error: unknown;
  errorMessage: string;
  onClose: () => void;
  onRefresh: () => void;
  onSave: (content: string) => Promise<unknown>;
};

export function ResourceYamlEditorModal({
  open,
  title,
  resourceKind,
  resourceLabel,
  result,
  loading,
  saving,
  error,
  errorMessage,
  onClose,
  onRefresh,
  onSave,
}: ResourceYamlEditorModalProps) {
  const [draft, setDraft] = useState('');
  const [baseline, setBaseline] = useState('');

  const expectedIdentity = useMemo(() => {
    const [namespace = '', name = ''] = resourceLabel.split('/');
    return {
      namespace: namespace.trim(),
      name: name.trim(),
    };
  }, [resourceLabel]);

  const validation = useMemo(() => {
    const parsedKind = readTopLevelYamlValue(draft, 'kind');
    const parsedAPIVersion = readTopLevelYamlValue(draft, 'apiVersion');
    const parsedName = readMetadataYamlValue(draft, 'name');
    const parsedNamespace = readMetadataYamlValue(draft, 'namespace');
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!draft.trim()) {
      errors.push('YAML content cannot be empty.');
    }
    if (!parsedAPIVersion) {
      errors.push('Missing required field: apiVersion.');
    }
    if (!parsedKind) {
      errors.push('Missing required field: kind.');
    }
    if (!parsedName) {
      errors.push('Missing required field: metadata.name.');
    }
    if (!parsedNamespace) {
      errors.push('Missing required field: metadata.namespace.');
    }
    if (parsedKind && parsedKind !== resourceKind) {
      errors.push(`Resource kind must remain ${resourceKind}.`);
    }
    if (parsedName && expectedIdentity.name && parsedName !== expectedIdentity.name) {
      errors.push(`metadata.name must remain ${expectedIdentity.name}.`);
    }
    if (
      parsedNamespace &&
      expectedIdentity.namespace &&
      parsedNamespace !== expectedIdentity.namespace
    ) {
      errors.push(`metadata.namespace must remain ${expectedIdentity.namespace}.`);
    }

    if (resourceKind === 'Pod') {
      warnings.push('Direct Pod edits are often temporary and may be overwritten when the Pod is recreated.');
    }
    if (draft.includes('\n  ownerReferences:')) {
      warnings.push('This manifest is controller-linked. Upstream workload controllers may override some changes.');
    }
    if (draft.includes('\n  generateName:')) {
      warnings.push('generateName is present. Renaming or cloning this manifest can create a new resource instead of updating the current one.');
    }

    return {
      parsedKind,
      parsedName,
      parsedNamespace,
      errors,
      warnings,
    };
  }, [draft, expectedIdentity.name, expectedIdentity.namespace, resourceKind]);
  const isDirty = draft !== baseline;
  const hasDraftContent = draft.trim().length > 0;
  const showValidationState = hasDraftContent || isDirty;

  useEffect(() => {
    if (!open) {
      setDraft('');
      setBaseline('');
      return;
    }

    if (result?.content == null) {
      return;
    }

    if (baseline === '') {
      setDraft(result.content);
      setBaseline(result.content);
      return;
    }

    if (!isDirty) {
      setDraft(result.content);
      setBaseline(result.content);
      return;
    }

    if (draft === result.content) {
      setBaseline(result.content);
    }
  }, [baseline, draft, isDirty, open, result?.content]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') {
        return;
      }

      event.preventDefault();
      if (!hasDraftContent || !isDirty || validation.errors.length > 0 || saving) {
        return;
      }

      void handleSave();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [draft, hasDraftContent, isDirty, onSave, open, saving, validation.errors.length]);

  const handleSave = async () => {
    if (!hasDraftContent || !isDirty || validation.errors.length > 0 || saving) {
      return;
    }

    await onSave(draft);
    setBaseline(draft);
  };

  const requestClose = () => {
    if (!isDirty) {
      onClose();
      return;
    }

    Modal.confirm({
      title: 'Discard unsaved YAML changes?',
      content: 'Your local edits have not been saved to the cluster.',
      okText: 'Discard',
      cancelText: 'Keep Editing',
      okButtonProps: { danger: true },
      onOk: onClose,
    });
  };

  const requestRefresh = () => {
    if (!isDirty) {
      onRefresh();
      return;
    }

    Modal.confirm({
      title: 'Reload YAML from cluster?',
      content: 'Refreshing now will replace your unsaved local edits with the latest cluster manifest.',
      okText: 'Reload',
      cancelText: 'Keep Editing',
      onOk: onRefresh,
    });
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={requestClose}
      footer={null}
      width={1040}
      destroyOnHidden
    >
      <section className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Space wrap>
            <Tag color="blue">Edit YAML</Tag>
            <Typography.Text type="secondary">{resourceLabel}</Typography.Text>
            <Tag color={isDirty ? 'orange' : 'default'}>{isDirty ? 'Unsaved' : 'Synced'}</Tag>
            <Tag
              color={
                !showValidationState ? 'default' : validation.errors.length > 0 ? 'red' : 'green'
              }
            >
              {!showValidationState
                ? 'Waiting for YAML'
                : validation.errors.length > 0
                  ? 'Validation Failed'
                  : 'Validation Ready'}
            </Tag>
          </Space>
          <Space wrap>
            <Button
              onClick={() => {
                const nextContent = result?.content ?? '';
                setDraft(nextContent);
                setBaseline(nextContent);
              }}
              disabled={!isDirty}
            >
              Reset
            </Button>
            <Button onClick={requestRefresh} loading={loading}>
              Refresh
            </Button>
            <Button
              type="primary"
              onClick={() => {
                void handleSave();
              }}
              loading={saving}
              disabled={!hasDraftContent || !isDirty || validation.errors.length > 0}
            >
              Save YAML
            </Button>
          </Space>
        </div>

        <Alert
          type="info"
          showIcon
          message="Edit the manifest directly. Read-only metadata and noisy apply annotations are hidden to keep the editor clean."
        />

        {error ? <Alert type="warning" showIcon message={errorMessage} /> : null}

        {showValidationState && validation.errors.length > 0 ? (
          <Alert
            type="error"
            showIcon
            message="Validation failed"
            description={
              <div className="space-y-1">
                {validation.errors.map((item) => (
                  <div key={item}>{item}</div>
                ))}
              </div>
            }
          />
        ) : null}

        {showValidationState && validation.warnings.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            message="Risk notice"
            description={
              <div className="space-y-1">
                {validation.warnings.map((item) => (
                  <div key={item}>{item}</div>
                ))}
              </div>
            }
          />
        ) : null}

        <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Generated: {result?.generatedAt || '-'}</span>
            <span>Kind: {validation.parsedKind || '-'}</span>
            <span>Name: {validation.parsedName || '-'}</span>
            <span>Namespace: {validation.parsedNamespace || '-'}</span>
            <span>Shortcut: Cmd/Ctrl+S</span>
          </div>
          <Input.TextArea
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            autoSize={false}
            spellCheck={false}
            className="!min-h-[560px] font-mono"
          />
        </div>
      </section>
    </Modal>
  );
}

function readTopLevelYamlValue(content: string, key: string) {
  const match = content.match(new RegExp(`^${escapeRegExp(key)}:\\s*(.+)\\s*$`, 'm'));
  return normalizeYamlScalar(match?.[1]);
}

function readMetadataYamlValue(content: string, key: string) {
  const metadataMatch = content.match(/^metadata:\s*\n((?:^[ \t]+.*(?:\n|$))*)/m);
  if (!metadataMatch) {
    return '';
  }

  const fieldMatch = metadataMatch[1].match(
    new RegExp(`^\\s{2}${escapeRegExp(key)}:\\s*(.+)\\s*$`, 'm'),
  );
  return normalizeYamlScalar(fieldMatch?.[1]);
}

function normalizeYamlScalar(value?: string) {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

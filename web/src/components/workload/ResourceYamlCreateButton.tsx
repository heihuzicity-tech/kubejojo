import { App } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Input, Modal, Space, Tag, Tooltip, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';

import { createManifest } from '../../services/cluster';

type SupportedResourceKind =
  | 'ClusterRole'
  | 'ClusterRoleBinding'
  | 'ConfigMap'
  | 'CronJob'
  | 'DaemonSet'
  | 'Deployment'
  | 'HorizontalPodAutoscaler'
  | 'Ingress'
  | 'Job'
  | 'LimitRange'
  | 'NetworkPolicy'
  | 'PersistentVolumeClaim'
  | 'ResourceQuota'
  | 'Role'
  | 'RoleBinding'
  | 'Secret'
  | 'Service'
  | 'ServiceAccount'
  | 'StatefulSet'
  | 'VerticalPodAutoscaler';

type ResourceYamlCreateButtonProps = {
  resourceKind: SupportedResourceKind;
  namespace: string;
  enabled?: boolean;
  disabledReason?: string;
  onCreated: () => void | Promise<unknown>;
  buttonLabel?: string;
};

type ResourceTemplateDefinition = {
  namespaced: boolean;
  template: (namespace: string) => string;
};

const resourceTemplateDefinitions: Record<SupportedResourceKind, ResourceTemplateDefinition> = {
  ClusterRole: {
    namespaced: false,
    template: () => `apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: pod-reader
rules:
  - apiGroups:
      - ""
    resources:
      - pods
      - pods/log
    verbs:
      - get
      - list
      - watch`,
  },
  ClusterRoleBinding: {
    namespaced: false,
    template: () => `apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: pod-reader-binding
subjects:
  - kind: ServiceAccount
    name: default
    namespace: default
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: pod-reader`,
  },
  ConfigMap: {
    namespaced: true,
    template: (namespace) => `apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: ${namespace}
data:
  APP_MODE: production
  LOG_LEVEL: info`,
  },
  CronJob: {
    namespaced: true,
    template: (namespace) => `apiVersion: batch/v1
kind: CronJob
metadata:
  name: hello-cron
  namespace: ${namespace}
spec:
  schedule: "*/5 * * * *"
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: curl
              image: curlimages/curl:8.7.1
              args:
                - -fsS
                - https://example.com/healthz`,
  },
  DaemonSet: {
    namespaced: true,
    template: (namespace) => `apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter-demo
  namespace: ${namespace}
spec:
  selector:
    matchLabels:
      app: node-exporter-demo
  template:
    metadata:
      labels:
        app: node-exporter-demo
    spec:
      containers:
        - name: exporter
          image: prom/node-exporter:v1.8.1
          ports:
            - containerPort: 9100`,
  },
  Deployment: {
    namespaced: true,
    template: (namespace) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-demo
  namespace: ${namespace}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nginx-demo
  template:
    metadata:
      labels:
        app: nginx-demo
    spec:
      containers:
        - name: nginx
          image: nginx:1.27
          ports:
            - containerPort: 80`,
  },
  HorizontalPodAutoscaler: {
    namespaced: true,
    template: (namespace) => `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: nginx-demo
  namespace: ${namespace}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: nginx-demo
  minReplicas: 2
  maxReplicas: 6
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70`,
  },
  Ingress: {
    namespaced: true,
    template: (namespace) => `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: nginx-demo
  namespace: ${namespace}
spec:
  rules:
    - host: nginx-demo.local
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: nginx-demo
                port:
                  number: 80`,
  },
  Job: {
    namespaced: true,
    template: (namespace) => `apiVersion: batch/v1
kind: Job
metadata:
  name: hello-job
  namespace: ${namespace}
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: hello
          image: busybox:1.36
          command:
            - /bin/sh
            - -c
            - echo hello from job && sleep 5`,
  },
  LimitRange: {
    namespaced: true,
    template: (namespace) => `apiVersion: v1
kind: LimitRange
metadata:
  name: default-container-limits
  namespace: ${namespace}
spec:
  limits:
    - type: Container
      default:
        cpu: 500m
        memory: 512Mi
      defaultRequest:
        cpu: 100m
        memory: 128Mi`,
  },
  NetworkPolicy: {
    namespaced: true,
    template: (namespace) => `apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-same-app
  namespace: ${namespace}
spec:
  podSelector:
    matchLabels:
      app: nginx-demo
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: nginx-demo`,
  },
  PersistentVolumeClaim: {
    namespaced: true,
    template: (namespace) => `apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: app-data
  namespace: ${namespace}
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi`,
  },
  ResourceQuota: {
    namespaced: true,
    template: (namespace) => `apiVersion: v1
kind: ResourceQuota
metadata:
  name: namespace-quota
  namespace: ${namespace}
spec:
  hard:
    pods: "20"
    requests.cpu: "4"
    requests.memory: 8Gi
    limits.cpu: "8"
    limits.memory: 16Gi`,
  },
  Role: {
    namespaced: true,
    template: (namespace) => `apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: ${namespace}
rules:
  - apiGroups:
      - ""
    resources:
      - pods
      - pods/log
    verbs:
      - get
      - list
      - watch`,
  },
  RoleBinding: {
    namespaced: true,
    template: (namespace) => `apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: pod-reader-binding
  namespace: ${namespace}
subjects:
  - kind: ServiceAccount
    name: default
    namespace: ${namespace}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: pod-reader`,
  },
  Secret: {
    namespaced: true,
    template: (namespace) => `apiVersion: v1
kind: Secret
metadata:
  name: app-secret
  namespace: ${namespace}
type: Opaque
stringData:
  username: admin
  password: change-me`,
  },
  Service: {
    namespaced: true,
    template: (namespace) => `apiVersion: v1
kind: Service
metadata:
  name: nginx-demo
  namespace: ${namespace}
spec:
  selector:
    app: nginx-demo
  ports:
    - name: http
      port: 80
      targetPort: 80`,
  },
  ServiceAccount: {
    namespaced: true,
    template: (namespace) => `apiVersion: v1
kind: ServiceAccount
metadata:
  name: app-runner
  namespace: ${namespace}`,
  },
  StatefulSet: {
    namespaced: true,
    template: (namespace) => `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: web
  namespace: ${namespace}
spec:
  serviceName: web
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: nginx
          image: nginx:1.27
          ports:
            - containerPort: 80`,
  },
  VerticalPodAutoscaler: {
    namespaced: true,
    template: (namespace) => `apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: nginx-demo
  namespace: ${namespace}
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: nginx-demo
  updatePolicy:
    updateMode: "Off"`,
  },
};

export function ResourceYamlCreateButton({
  resourceKind,
  namespace,
  enabled = true,
  disabledReason,
  onCreated,
  buttonLabel = 'Create YAML',
}: ResourceYamlCreateButtonProps) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [baseline, setBaseline] = useState('');

  const definition = resourceTemplateDefinitions[resourceKind];
  const normalizedNamespace = namespace.trim();
  const templateContent = useMemo(
    () => definition.template(normalizedNamespace || 'default'),
    [definition, normalizedNamespace],
  );

  const createMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => createManifest(content),
    onSuccess: async (result) => {
      void message.success(result.message);
      setOpen(false);
      setDraft('');
      setBaseline('');
      await onCreated();
    },
  });

  const validation = useMemo(() => {
    const parsedKind = readTopLevelYamlValue(draft, 'kind');
    const parsedAPIVersion = readTopLevelYamlValue(draft, 'apiVersion');
    const parsedName = readMetadataYamlValue(draft, 'name');
    const parsedNamespace = readMetadataYamlValue(draft, 'namespace');
    const generatedName = readMetadataYamlValue(draft, 'generateName');
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!draft.trim()) {
      errors.push('YAML content cannot be empty.');
    }
    if (containsMultipleDocuments(draft)) {
      errors.push('Only a single manifest can be created at a time.');
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
    if (generatedName) {
      errors.push('metadata.generateName is not supported here. Use metadata.name instead.');
    }
    if (parsedKind && parsedKind !== resourceKind) {
      errors.push(`Resource kind must remain ${resourceKind}.`);
    }
    if (definition.namespaced && !normalizedNamespace) {
      errors.push('Select a namespace before creating this resource.');
    }
    if (definition.namespaced && !parsedNamespace) {
      errors.push('Missing required field: metadata.namespace.');
    }
    if (definition.namespaced && parsedNamespace && parsedNamespace !== normalizedNamespace) {
      errors.push(`metadata.namespace must remain ${normalizedNamespace}.`);
    }
    if (!definition.namespaced && parsedNamespace) {
      errors.push('Cluster-scoped resources must not set metadata.namespace.');
    }
    if (draft.includes('\n  ownerReferences:')) {
      warnings.push('This manifest contains ownerReferences. Controller-managed resources may replace it.');
    }

    return {
      parsedKind,
      parsedName,
      parsedNamespace,
      errors,
      warnings,
    };
  }, [definition.namespaced, draft, normalizedNamespace, resourceKind]);

  const isDirty = draft !== baseline;
  const hasDraftContent = draft.trim().length > 0;
  const showValidationState = hasDraftContent || isDirty;
  const computedDisabledReason =
    !enabled
      ? (disabledReason ?? 'Live cluster access is required.')
      : definition.namespaced && !normalizedNamespace
        ? 'Select a namespace before creating resources.'
        : '';

  useEffect(() => {
    if (!open) {
      setDraft('');
      setBaseline('');
      return;
    }

    if (baseline === '' || !isDirty) {
      setDraft(templateContent);
      setBaseline(templateContent);
    }
  }, [baseline, isDirty, open, templateContent]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') {
        return;
      }

      event.preventDefault();
      if (!hasDraftContent || createMutation.isPending || validation.errors.length > 0) {
        return;
      }

      void handleCreate();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createMutation.isPending, draft, hasDraftContent, open, validation.errors.length]);

  const handleCreate = async () => {
    if (!hasDraftContent || createMutation.isPending || validation.errors.length > 0) {
      return;
    }

    await createMutation.mutateAsync({ content: draft });
  };

  const requestClose = () => {
    if (!isDirty) {
      setOpen(false);
      return;
    }

    Modal.confirm({
      title: 'Discard create manifest draft?',
      content: 'Your local draft has not been submitted to the cluster.',
      okText: 'Discard',
      cancelText: 'Keep Editing',
      okButtonProps: { danger: true },
      onOk: () => setOpen(false),
    });
  };

  return (
    <>
      <Tooltip title={computedDisabledReason || undefined}>
        <span>
          <Button
            type="primary"
            disabled={computedDisabledReason !== ''}
            onClick={() => setOpen(true)}
          >
            {buttonLabel}
          </Button>
        </span>
      </Tooltip>

      <Modal
        title={`Create ${resourceKind} YAML`}
        open={open}
        onCancel={requestClose}
        footer={null}
        width={1040}
        destroyOnHidden
      >
        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Space wrap>
              <Tag color="blue">Create YAML</Tag>
              <Typography.Text type="secondary">
                {definition.namespaced ? normalizedNamespace : 'Cluster Scope'}
              </Typography.Text>
              <Tag color={isDirty ? 'orange' : 'default'}>{isDirty ? 'Modified' : 'Template'}</Tag>
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
                  setDraft(templateContent);
                  setBaseline(templateContent);
                }}
                disabled={!isDirty}
              >
                Reset Template
              </Button>
              <Button
                type="primary"
                onClick={() => {
                  void handleCreate();
                }}
                loading={createMutation.isPending}
                disabled={!hasDraftContent || validation.errors.length > 0}
              >
                Create Resource
              </Button>
            </Space>
          </div>

          <Alert
            type="info"
            showIcon
            message="Submit a single manifest. Existing names will be rejected instead of updated."
          />

          {createMutation.error ? (
            <Alert
              type="error"
              showIcon
              message={extractErrorMessage(createMutation.error, `${resourceKind} creation failed.`)}
            />
          ) : null}

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
    </>
  );
}

function containsMultipleDocuments(content: string) {
  return /(^|\n)---\s*(\n|$)/.test(content.trim());
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

function extractErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') {
    return fallback;
  }

  const maybeError = error as {
    message?: unknown;
    response?: {
      data?: {
        message?: unknown;
      };
    };
  };

  if (typeof maybeError.response?.data?.message === 'string' && maybeError.response.data.message.trim() !== '') {
    return maybeError.response.data.message;
  }
  if (typeof maybeError.message === 'string' && maybeError.message.trim() !== '') {
    return maybeError.message;
  }

  return fallback;
}

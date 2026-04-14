import type { ReactNode } from 'react';

import {
  ApartmentOutlined,
  AppstoreOutlined,
  BranchesOutlined,
  ClusterOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from '@ant-design/icons';

export type NavigationItem = {
  key: string;
  label: string;
  path: string;
  description: string;
  implemented: boolean;
};

export type NavigationSection = {
  key: string;
  label: string;
  icon: ReactNode;
  items: NavigationItem[];
};

export const navigationSections: NavigationSection[] = [
  {
    key: 'cluster',
    label: '集群',
    icon: <ClusterOutlined />,
    items: [
      {
        key: 'cluster-overview',
        label: 'Overview',
        path: '/cluster/overview',
        description: '单集群总览与运行状态概览',
        implemented: true,
      },
      {
        key: 'cluster-namespaces',
        label: 'Namespaces',
        path: '/cluster/namespaces',
        description: '命名空间列表、状态与标签查看',
        implemented: true,
      },
      {
        key: 'cluster-nodes',
        label: 'Nodes',
        path: '/cluster/nodes',
        description: '节点健康、版本、资源与详情查看',
        implemented: true,
      },
    ],
  },
  {
    key: 'topology',
    label: '资源全景图',
    icon: <ApartmentOutlined />,
    items: [
      {
        key: 'topology-overview',
        label: 'Topology',
        path: '/topology',
        description: '资源关系拓扑与访问路径展示',
        implemented: true,
      },
    ],
  },
  {
    key: 'workloads',
    label: '工作负载',
    icon: <DeploymentUnitOutlined />,
    items: [
      {
        key: 'workloads-pods',
        label: 'Pods',
        path: '/workloads/pods',
        description: 'Pod 列表与排障入口',
        implemented: true,
      },
      {
        key: 'workloads-deployments',
        label: 'Deployments',
        path: '/workloads/deployments',
        description: 'Deployment 管理与发布操作',
        implemented: true,
      },
      {
        key: 'workloads-statefulsets',
        label: 'StatefulSets',
        path: '/workloads/statefulsets',
        description: 'StatefulSet 管理与有状态工作负载查看',
        implemented: true,
      },
      {
        key: 'workloads-daemonsets',
        label: 'DaemonSets',
        path: '/workloads/daemonsets',
        description: 'DaemonSet 管理与节点常驻组件查看',
        implemented: true,
      },
      {
        key: 'workloads-replicasets',
        label: 'ReplicaSets',
        path: '/workloads/replicasets',
        description: 'ReplicaSet 列表与关联查看',
        implemented: true,
      },
      {
        key: 'workloads-jobs',
        label: 'Jobs',
        path: '/workloads/jobs',
        description: 'Job 执行记录与状态查看',
        implemented: true,
      },
      {
        key: 'workloads-cronjobs',
        label: 'CronJobs',
        path: '/workloads/cronjobs',
        description: '定时任务管理与调度查看',
        implemented: true,
      },
    ],
  },
  {
    key: 'network',
    label: '网络管理',
    icon: <BranchesOutlined />,
    items: [
      {
        key: 'network-services',
        label: 'Services',
        path: '/network/services',
        description: 'Service 管理与服务暴露信息',
        implemented: true,
      },
      {
        key: 'network-endpoints',
        label: 'Endpoints',
        path: '/network/endpoints',
        description: '后端实例映射与服务发现信息',
        implemented: true,
      },
      {
        key: 'network-ingresses',
        label: 'Ingresses',
        path: '/network/ingresses',
        description: 'Ingress 路由与访问入口管理',
        implemented: true,
      },
      {
        key: 'network-ingressclasses',
        label: 'IngressClasses',
        path: '/network/ingressclasses',
        description: 'IngressClass 控制器与默认类查看',
        implemented: true,
      },
      {
        key: 'network-policies',
        label: 'NetworkPolicies',
        path: '/network/networkpolicies',
        description: '网络隔离策略与访问规则查看',
        implemented: true,
      },
      {
        key: 'network-gateways',
        label: 'Gateway',
        path: '/network/gateways',
        description: 'Gateway API 入口资源管理',
        implemented: false,
      },
      {
        key: 'network-gatewayclasses',
        label: 'GatewayClasses',
        path: '/network/gatewayclasses',
        description: 'GatewayClass 控制器与接纳状态查看',
        implemented: false,
      },
    ],
  },
  {
    key: 'storage',
    label: '存储管理',
    icon: <DatabaseOutlined />,
    items: [
      {
        key: 'storage-pvcs',
        label: 'PersistentVolumeClaims',
        path: '/storage/persistentvolumeclaims',
        description: 'PVC 列表与绑定状态查看',
        implemented: true,
      },
      {
        key: 'storage-pvs',
        label: 'PersistentVolumes',
        path: '/storage/persistentvolumes',
        description: 'PV 资源与回收策略查看',
        implemented: true,
      },
      {
        key: 'storage-classes',
        label: 'StorageClasses',
        path: '/storage/storageclasses',
        description: '存储类与默认 Provisioner 查看',
        implemented: true,
      },
    ],
  },
  {
    key: 'security',
    label: '安全管理',
    icon: <SafetyCertificateOutlined />,
    items: [
      {
        key: 'security-serviceaccounts',
        label: 'ServiceAccounts',
        path: '/security/serviceaccounts',
        description: '服务账号与认证主体查看',
        implemented: false,
      },
      {
        key: 'security-roles',
        label: 'Roles',
        path: '/security/roles',
        description: '命名空间内角色规则查看',
        implemented: false,
      },
      {
        key: 'security-rolebindings',
        label: 'RoleBindings',
        path: '/security/rolebindings',
        description: '角色绑定与授权关系查看',
        implemented: false,
      },
    ],
  },
  {
    key: 'config',
    label: '配置管理',
    icon: <SettingOutlined />,
    items: [
      {
        key: 'config-configmaps',
        label: 'ConfigMaps',
        path: '/config/configmaps',
        description: '配置项列表与编辑入口',
        implemented: false,
      },
      {
        key: 'config-secrets',
        label: 'Secrets',
        path: '/config/secrets',
        description: '密钥资源查看与受控编辑',
        implemented: false,
      },
    ],
  },
  {
    key: 'resources',
    label: '资源管理',
    icon: <AppstoreOutlined />,
    items: [
      {
        key: 'resources-hpas',
        label: 'HPAs',
        path: '/resources/hpas',
        description: '水平自动伸缩规则查看',
        implemented: false,
      },
      {
        key: 'resources-vpas',
        label: 'VPAs',
        path: '/resources/vpas',
        description: '垂直自动伸缩建议与策略查看',
        implemented: false,
      },
      {
        key: 'resources-resourcequotas',
        label: 'ResourceQuotas',
        path: '/resources/resourcequotas',
        description: '命名空间资源配额治理',
        implemented: false,
      },
      {
        key: 'resources-limitranges',
        label: 'LimitRanges',
        path: '/resources/limitranges',
        description: '默认资源限制与请求范围查看',
        implemented: false,
      },
    ],
  },
];

export const navigationItems = navigationSections.flatMap((section) =>
  section.items.map((item) => ({
    ...item,
    sectionKey: section.key,
    sectionLabel: section.label,
  })),
);

export function findNavigationItem(pathname: string) {
  const sortedItems = [...navigationItems].sort((left, right) => right.path.length - left.path.length);
  return sortedItems.find(
    (item) => pathname === item.path || pathname.startsWith(`${item.path}/`),
  );
}

package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	authv1 "k8s.io/api/authentication/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	metricsv1beta1 "k8s.io/metrics/pkg/apis/metrics/v1beta1"

	"github.com/zhangya/k8s-admin/server/internal/kube"
)

type ClusterService struct {
	client *kube.Client
}

type AuthMe struct {
	Name           string `json:"name"`
	AuthMode       string `json:"authMode"`
	CurrentContext string `json:"currentContext"`
	KubeconfigPath string `json:"kubeconfigPath"`
}

type NodeItem struct {
	Name        string `json:"name"`
	Role        string `json:"role"`
	IP          string `json:"ip"`
	Status      string `json:"status"`
	Kubelet     string `json:"kubeletVersion"`
	OSImage     string `json:"osImage"`
	Kernel      string `json:"kernelVersion"`
	ContainerRT string `json:"containerRuntime"`
}

type OverviewSummary struct {
	KubernetesVersion string `json:"kubernetesVersion"`
	ClusterStatus     string `json:"clusterStatus"`
	NodesReady        string `json:"nodesReady"`
	Namespaces        int    `json:"namespaces"`
	PodsRunningTotal  string `json:"podsRunningTotal"`
	MetricsAvailable  bool   `json:"metricsAvailable"`
	CPUUsage          string `json:"cpuUsage,omitempty"`
	MemoryUsage       string `json:"memoryUsage,omitempty"`
}

type WarningEvent struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Reason    string `json:"reason"`
	Message   string `json:"message"`
	Count     int32  `json:"count"`
	LastSeen  string `json:"lastSeen"`
}

type NamespacePodStat struct {
	Namespace string `json:"namespace"`
	Pods      int    `json:"pods"`
}

func normalizeNamespace(namespace string) string {
	namespace = strings.TrimSpace(namespace)
	if namespace == "" || namespace == "all" || namespace == "all-namespaces" {
		return ""
	}

	return namespace
}

func NewClusterService(client *kube.Client) *ClusterService {
	return &ClusterService{client: client}
}

func (s *ClusterService) GetAuthMe(ctx context.Context) AuthMe {
	name := s.client.RawConfig.AuthInfoName
	if review, err := s.client.Kubernetes.AuthenticationV1().SelfSubjectReviews().Create(
		ctx,
		&authv1.SelfSubjectReview{},
		metav1.CreateOptions{},
	); err == nil {
		if value := strings.TrimSpace(review.Status.UserInfo.Username); value != "" {
			name = value
		}
	}

	if name == "" {
		name = "token-user"
	}

	return AuthMe{
		Name:           name,
		AuthMode:       s.client.AuthMode,
		CurrentContext: s.client.RawConfig.CurrentContext,
		KubeconfigPath: s.client.ConfigPath,
	}
}

func (s *ClusterService) ListNamespaces(ctx context.Context) ([]string, error) {
	items, err := s.client.Kubernetes.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list namespaces: %w", err)
	}

	namespaces := make([]string, 0, len(items.Items))
	for _, item := range items.Items {
		namespaces = append(namespaces, item.Name)
	}

	return namespaces, nil
}

func (s *ClusterService) ListNodes(ctx context.Context) ([]NodeItem, error) {
	items, err := s.client.Kubernetes.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list nodes: %w", err)
	}

	nodes := make([]NodeItem, 0, len(items.Items))
	for _, item := range items.Items {
		nodes = append(nodes, NodeItem{
			Name:        item.Name,
			Role:        nodeRole(item),
			IP:          internalIP(item),
			Status:      readyStatus(item),
			Kubelet:     item.Status.NodeInfo.KubeletVersion,
			OSImage:     item.Status.NodeInfo.OSImage,
			Kernel:      item.Status.NodeInfo.KernelVersion,
			ContainerRT: item.Status.NodeInfo.ContainerRuntimeVersion,
		})
	}

	return nodes, nil
}

func (s *ClusterService) GetOverviewSummary(ctx context.Context, namespace string) (OverviewSummary, error) {
	namespace = normalizeNamespace(namespace)

	nodes, err := s.client.Kubernetes.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return OverviewSummary{}, fmt.Errorf("list nodes: %w", err)
	}

	namespaceCount := 1
	if namespace == "" {
		namespaces, err := s.client.Kubernetes.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
		if err != nil {
			return OverviewSummary{}, fmt.Errorf("list namespaces: %w", err)
		}
		namespaceCount = len(namespaces.Items)
	}

	pods, err := s.client.Kubernetes.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return OverviewSummary{}, fmt.Errorf("list pods: %w", err)
	}

	version, err := s.client.Kubernetes.Discovery().ServerVersion()
	if err != nil {
		return OverviewSummary{}, fmt.Errorf("get server version: %w", err)
	}

	readyCount := 0
	for _, node := range nodes.Items {
		if isNodeReady(node) {
			readyCount++
		}
	}

	summary := OverviewSummary{
		KubernetesVersion: version.GitVersion,
		ClusterStatus:     clusterStatus(readyCount, len(nodes.Items)),
		NodesReady:        fmt.Sprintf("%d/%d", readyCount, len(nodes.Items)),
		Namespaces:        namespaceCount,
		PodsRunningTotal:  fmt.Sprintf("%d/%d", runningPods(pods.Items), len(pods.Items)),
		MetricsAvailable:  false,
	}

	nodeMetrics, err := s.client.Metrics.MetricsV1beta1().NodeMetricses().List(ctx, metav1.ListOptions{})
	if err == nil && len(nodeMetrics.Items) > 0 {
		cpuUsage, memoryUsage := aggregateNodeMetrics(nodeMetrics.Items, nodes.Items)
		summary.MetricsAvailable = true
		summary.CPUUsage = cpuUsage
		summary.MemoryUsage = memoryUsage
	}

	return summary, nil
}

func (s *ClusterService) ListWarningEvents(ctx context.Context, namespace string, limit int) ([]WarningEvent, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list events: %w", err)
	}

	events := make([]corev1.Event, 0, len(items.Items))
	for _, item := range items.Items {
		if item.Type == corev1.EventTypeWarning {
			events = append(events, item)
		}
	}

	sort.Slice(events, func(i, j int) bool {
		return eventTimestamp(events[i]).After(eventTimestamp(events[j]))
	})

	if limit > 0 && len(events) > limit {
		events = events[:limit]
	}

	result := make([]WarningEvent, 0, len(events))
	for _, item := range events {
		result = append(result, WarningEvent{
			Kind:      item.InvolvedObject.Kind,
			Name:      item.InvolvedObject.Name,
			Namespace: item.Namespace,
			Reason:    item.Reason,
			Message:   item.Message,
			Count:     item.Count,
			LastSeen:  eventTimestamp(item).Format("2006-01-02 15:04:05"),
		})
	}

	return result, nil
}

func (s *ClusterService) ListNamespacePodTop(ctx context.Context, namespace string, limit int) ([]NamespacePodStat, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list pods: %w", err)
	}

	counts := make(map[string]int)
	for _, item := range items.Items {
		counts[item.Namespace]++
	}

	stats := make([]NamespacePodStat, 0, len(counts))
	for namespace, pods := range counts {
		stats = append(stats, NamespacePodStat{
			Namespace: namespace,
			Pods:      pods,
		})
	}

	sort.Slice(stats, func(i, j int) bool {
		if stats[i].Pods == stats[j].Pods {
			return stats[i].Namespace < stats[j].Namespace
		}
		return stats[i].Pods > stats[j].Pods
	})

	if limit > 0 && len(stats) > limit {
		stats = stats[:limit]
	}

	return stats, nil
}

func nodeRole(node corev1.Node) string {
	if _, ok := node.Labels["node-role.kubernetes.io/control-plane"]; ok {
		return "control-plane"
	}

	if _, ok := node.Labels["node-role.kubernetes.io/master"]; ok {
		return "control-plane"
	}

	return "worker"
}

func internalIP(node corev1.Node) string {
	for _, address := range node.Status.Addresses {
		if address.Type == corev1.NodeInternalIP {
			return address.Address
		}
	}

	return ""
}

func readyStatus(node corev1.Node) string {
	status := "NotReady"
	for _, condition := range node.Status.Conditions {
		if condition.Type == corev1.NodeReady && condition.Status == corev1.ConditionTrue {
			status = "Ready"
			break
		}
	}

	if node.Spec.Unschedulable {
		return status + ",SchedulingDisabled"
	}

	return status
}

func isNodeReady(node corev1.Node) bool {
	for _, condition := range node.Status.Conditions {
		if condition.Type == corev1.NodeReady && condition.Status == corev1.ConditionTrue {
			return true
		}
	}

	return false
}

func clusterStatus(readyCount int, total int) string {
	switch {
	case total == 0:
		return "Unknown"
	case readyCount == total:
		return "Healthy"
	case readyCount > 0:
		return "Degraded"
	default:
		return "Unavailable"
	}
}

func runningPods(items []corev1.Pod) int {
	count := 0
	for _, pod := range items {
		if pod.Status.Phase == corev1.PodRunning {
			count++
		}
	}

	return count
}

func aggregateNodeMetrics(metricsItems []metricsv1beta1.NodeMetrics, nodes []corev1.Node) (string, string) {
	totalCPUCapacity := resource.NewMilliQuantity(0, resource.DecimalSI)
	totalMemoryCapacity := resource.NewQuantity(0, resource.BinarySI)
	totalCPUUsage := resource.NewMilliQuantity(0, resource.DecimalSI)
	totalMemoryUsage := resource.NewQuantity(0, resource.BinarySI)

	for _, node := range nodes {
		if cpu := node.Status.Capacity.Cpu(); cpu != nil {
			totalCPUCapacity.Add(*cpu)
		}
		if memory := node.Status.Capacity.Memory(); memory != nil {
			totalMemoryCapacity.Add(*memory)
		}
	}

	for _, item := range metricsItems {
		if cpu := item.Usage.Cpu(); cpu != nil {
			totalCPUUsage.Add(*cpu)
		}
		if memory := item.Usage.Memory(); memory != nil {
			totalMemoryUsage.Add(*memory)
		}
	}

	return percentage(totalCPUUsage.MilliValue(), totalCPUCapacity.MilliValue()), percentage(totalMemoryUsage.Value(), totalMemoryCapacity.Value())
}

func percentage(usage int64, capacity int64) string {
	if capacity == 0 {
		return ""
	}

	return fmt.Sprintf("%.1f%%", float64(usage)/float64(capacity)*100)
}

func eventTimestamp(item corev1.Event) time.Time {
	switch {
	case !item.EventTime.IsZero():
		return item.EventTime.Time
	case !item.LastTimestamp.IsZero():
		return item.LastTimestamp.Time
	case item.Series != nil && !item.Series.LastObservedTime.IsZero():
		return item.Series.LastObservedTime.Time
	default:
		return item.CreationTimestamp.Time
	}
}

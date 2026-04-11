package service

import (
	"context"
	"fmt"
	"sort"
	"strings"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"

	"github.com/zhangya/k8s-admin/server/internal/jsonx"
)

const (
	TopologySourceWorkloads = "workloads"
	TopologySourceNetwork   = "network"
	TopologySourceStorage   = "storage"

	TopologyStatusHealthy = "healthy"
	TopologyStatusWarning = "warning"
	TopologyStatusError   = "error"
)

type TopologyGraph struct {
	Resources jsonx.Slice[TopologyResource] `json:"resources"`
	Relations jsonx.Slice[TopologyRelation] `json:"relations"`
}

type TopologyResource struct {
	ID           string              `json:"id"`
	Kind         string              `json:"kind"`
	Name         string              `json:"name"`
	Namespace    string              `json:"namespace"`
	InstanceName string              `json:"instanceName,omitempty"`
	Source       string              `json:"source"`
	Status       string              `json:"status"`
	Summary      string              `json:"summary"`
	DetailLines  jsonx.Slice[string] `json:"detailLines"`
	NodeName     string              `json:"nodeName,omitempty"`
	Tags         jsonx.Slice[string] `json:"tags,omitempty"`
	Weight       int                 `json:"weight"`
	Warnings     int                 `json:"warnings"`
}

type TopologyRelation struct {
	ID     string `json:"id"`
	Source string `json:"source"`
	Target string `json:"target"`
	Label  string `json:"label"`
}

type topologyBuilder struct {
	selectedSources map[string]bool
	resources       []TopologyResource
	resourceIndex   map[string]TopologyResource
	resourceByUID   map[types.UID]string
	ownerByUID      map[types.UID]types.UID
	relations       []TopologyRelation
	relationIndex   map[string]struct{}
	warnings        map[string]int
}

func (s *ClusterService) GetTopologyGraph(
	ctx context.Context,
	namespace string,
	sources []string,
) (TopologyGraph, error) {
	namespace = normalizeNamespace(namespace)

	selectedSources := normalizeTopologySources(sources)
	builder := topologyBuilder{
		selectedSources: selectedSources,
		resourceIndex:   make(map[string]TopologyResource),
		resourceByUID:   make(map[types.UID]string),
		ownerByUID:      make(map[types.UID]types.UID),
		relationIndex:   make(map[string]struct{}),
		warnings:        make(map[string]int),
	}

	if err := builder.loadWarnings(ctx, s, namespace); err != nil {
		return TopologyGraph{}, err
	}

	pods, err := s.client.Kubernetes.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return TopologyGraph{}, fmt.Errorf("list pods: %w", err)
	}

	if builder.selectedSources[TopologySourceWorkloads] {
		if err := builder.loadWorkloads(ctx, s, namespace, pods.Items); err != nil {
			return TopologyGraph{}, err
		}
	}

	if builder.selectedSources[TopologySourceNetwork] {
		if err := builder.loadNetwork(ctx, s, namespace, pods.Items); err != nil {
			return TopologyGraph{}, err
		}
	}

	if builder.selectedSources[TopologySourceStorage] {
		if err := builder.loadStorage(ctx, s, namespace, pods.Items); err != nil {
			return TopologyGraph{}, err
		}
	}

	builder.addOwnerRelations(pods.Items)
	builder.sort()

	return TopologyGraph{
		Resources: jsonx.Slice[TopologyResource](builder.resources),
		Relations: jsonx.Slice[TopologyRelation](builder.relations),
	}, nil
}

func (b *topologyBuilder) loadWarnings(
	ctx context.Context,
	service *ClusterService,
	namespace string,
) error {
	events, err := service.client.Kubernetes.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("list events for topology: %w", err)
	}

	for _, item := range events.Items {
		if item.Type != corev1.EventTypeWarning {
			continue
		}

		key := warningKey(item.InvolvedObject.Kind, item.Namespace, item.InvolvedObject.Name)
		b.warnings[key] += int(item.Count)
	}

	return nil
}

func (b *topologyBuilder) loadWorkloads(
	ctx context.Context,
	service *ClusterService,
	namespace string,
	pods []corev1.Pod,
) error {
	deployments, err := service.client.Kubernetes.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("list deployments: %w", err)
	}

	statefulSets, err := service.client.Kubernetes.AppsV1().StatefulSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("list statefulsets: %w", err)
	}

	daemonSets, err := service.client.Kubernetes.AppsV1().DaemonSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("list daemonsets: %w", err)
	}

	replicaSets, err := service.client.Kubernetes.AppsV1().ReplicaSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("list replicasets: %w", err)
	}

	jobs, err := service.client.Kubernetes.BatchV1().Jobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("list jobs: %w", err)
	}

	cronJobs, err := service.client.Kubernetes.BatchV1().CronJobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("list cronjobs: %w", err)
	}

	for _, item := range deployments.Items {
		b.addResource(item.UID, TopologyResource{
			ID:           resourceID("Deployment", item.Namespace, item.Name),
			Kind:         "Deployment",
			Name:         item.Name,
			Namespace:    item.Namespace,
			InstanceName: instanceName(item.Labels),
			Source:       TopologySourceWorkloads,
			Status:       deploymentStatus(item, b.warningCount("Deployment", item.Namespace, item.Name)),
			Summary:      fmt.Sprintf("%d/%d ready", item.Status.ReadyReplicas, desiredReplicas(item.Spec.Replicas)),
			DetailLines:  []string{fmt.Sprintf("Available: %d", item.Status.AvailableReplicas), fmt.Sprintf("Updated: %d", item.Status.UpdatedReplicas)},
			Tags:         []string{"apps/v1"},
			Weight:       topologyWeight("Deployment"),
			Warnings:     b.warningCount("Deployment", item.Namespace, item.Name),
		})
	}

	for _, item := range statefulSets.Items {
		b.addResource(item.UID, TopologyResource{
			ID:           resourceID("StatefulSet", item.Namespace, item.Name),
			Kind:         "StatefulSet",
			Name:         item.Name,
			Namespace:    item.Namespace,
			InstanceName: instanceName(item.Labels),
			Source:       TopologySourceWorkloads,
			Status:       statefulSetStatus(item, b.warningCount("StatefulSet", item.Namespace, item.Name)),
			Summary:      fmt.Sprintf("%d/%d ready", item.Status.ReadyReplicas, desiredReplicas(item.Spec.Replicas)),
			DetailLines:  []string{fmt.Sprintf("Current: %d", item.Status.CurrentReplicas), fmt.Sprintf("Updated: %d", item.Status.UpdatedReplicas)},
			Tags:         []string{"apps/v1"},
			Weight:       topologyWeight("StatefulSet"),
			Warnings:     b.warningCount("StatefulSet", item.Namespace, item.Name),
		})
	}

	for _, item := range daemonSets.Items {
		b.addResource(item.UID, TopologyResource{
			ID:           resourceID("DaemonSet", item.Namespace, item.Name),
			Kind:         "DaemonSet",
			Name:         item.Name,
			Namespace:    item.Namespace,
			InstanceName: instanceName(item.Labels),
			Source:       TopologySourceWorkloads,
			Status:       daemonSetStatus(item, b.warningCount("DaemonSet", item.Namespace, item.Name)),
			Summary:      fmt.Sprintf("%d/%d ready", item.Status.NumberReady, item.Status.DesiredNumberScheduled),
			DetailLines:  []string{fmt.Sprintf("Available: %d", item.Status.NumberAvailable), fmt.Sprintf("Unavailable: %d", item.Status.NumberUnavailable)},
			Tags:         []string{"apps/v1"},
			Weight:       topologyWeight("DaemonSet"),
			Warnings:     b.warningCount("DaemonSet", item.Namespace, item.Name),
		})
	}

	for _, item := range replicaSets.Items {
		resourceIDValue := resourceID("ReplicaSet", item.Namespace, item.Name)
		b.addResource(item.UID, TopologyResource{
			ID:           resourceIDValue,
			Kind:         "ReplicaSet",
			Name:         item.Name,
			Namespace:    item.Namespace,
			InstanceName: instanceName(item.Labels),
			Source:       TopologySourceWorkloads,
			Status:       replicaSetStatus(item, b.warningCount("ReplicaSet", item.Namespace, item.Name)),
			Summary:      fmt.Sprintf("%d/%d ready", item.Status.ReadyReplicas, desiredReplicas(item.Spec.Replicas)),
			DetailLines:  []string{fmt.Sprintf("Available: %d", item.Status.AvailableReplicas), fmt.Sprintf("FullyLabeled: %d", item.Status.FullyLabeledReplicas)},
			Tags:         []string{"apps/v1"},
			Weight:       topologyWeight("ReplicaSet"),
			Warnings:     b.warningCount("ReplicaSet", item.Namespace, item.Name),
		})

		for _, owner := range item.OwnerReferences {
			ownerID, ok := b.resourceByUID[owner.UID]
			if ok {
				b.ownerByUID[item.UID] = owner.UID
				b.addRelation(resourceIDValue, ownerID, "owned by")
			}
		}
	}

	for _, item := range jobs.Items {
		resourceIDValue := resourceID("Job", item.Namespace, item.Name)
		b.addResource(item.UID, TopologyResource{
			ID:           resourceIDValue,
			Kind:         "Job",
			Name:         item.Name,
			Namespace:    item.Namespace,
			InstanceName: instanceName(item.Labels),
			Source:       TopologySourceWorkloads,
			Status:       jobStatus(item, b.warningCount("Job", item.Namespace, item.Name)),
			Summary:      fmt.Sprintf("%d succeeded / %d failed", item.Status.Succeeded, item.Status.Failed),
			DetailLines:  []string{fmt.Sprintf("Active: %d", item.Status.Active), fmt.Sprintf("Completions: %s", jobCompletions(item))},
			Tags:         []string{"batch/v1"},
			Weight:       topologyWeight("Job"),
			Warnings:     b.warningCount("Job", item.Namespace, item.Name),
		})

		for _, owner := range item.OwnerReferences {
			ownerID, ok := b.resourceByUID[owner.UID]
			if ok {
				b.ownerByUID[item.UID] = owner.UID
				b.addRelation(resourceIDValue, ownerID, "owned by")
			}
		}
	}

	for _, item := range cronJobs.Items {
		b.addResource(item.UID, TopologyResource{
			ID:           resourceID("CronJob", item.Namespace, item.Name),
			Kind:         "CronJob",
			Name:         item.Name,
			Namespace:    item.Namespace,
			InstanceName: instanceName(item.Labels),
			Source:       TopologySourceWorkloads,
			Status:       cronJobStatus(item, b.warningCount("CronJob", item.Namespace, item.Name)),
			Summary:      item.Spec.Schedule,
			DetailLines:  []string{fmt.Sprintf("Suspend: %t", item.Spec.Suspend != nil && *item.Spec.Suspend), fmt.Sprintf("Concurrency: %s", string(item.Spec.ConcurrencyPolicy))},
			Tags:         []string{"batch/v1"},
			Weight:       topologyWeight("CronJob"),
			Warnings:     b.warningCount("CronJob", item.Namespace, item.Name),
		})
	}

	for _, item := range pods {
		for _, owner := range item.OwnerReferences {
			b.ownerByUID[item.UID] = owner.UID
			break
		}

		b.addResource(item.UID, TopologyResource{
			ID:           resourceID("Pod", item.Namespace, item.Name),
			Kind:         "Pod",
			Name:         item.Name,
			Namespace:    item.Namespace,
			InstanceName: instanceName(item.Labels),
			Source:       TopologySourceWorkloads,
			Status:       podStatus(item, b.warningCount("Pod", item.Namespace, item.Name)),
			Summary:      podSummary(item),
			DetailLines:  []string{fmt.Sprintf("Ready: %s", podReadySummary(item)), fmt.Sprintf("Restarts: %d", podRestartCount(item)), fmt.Sprintf("Pod IP: %s", defaultString(item.Status.PodIP, "-"))},
			NodeName:     item.Spec.NodeName,
			Tags:         []string{"core/v1"},
			Weight:       topologyWeight("Pod"),
			Warnings:     b.warningCount("Pod", item.Namespace, item.Name),
		})
	}

	return nil
}

func (b *topologyBuilder) loadNetwork(
	ctx context.Context,
	service *ClusterService,
	namespace string,
	pods []corev1.Pod,
) error {
	services, err := service.client.Kubernetes.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("list services: %w", err)
	}

	ingresses, err := service.client.Kubernetes.NetworkingV1().Ingresses(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("list ingresses: %w", err)
	}

	podsByNamespace := make(map[string][]corev1.Pod)
	for _, pod := range pods {
		podsByNamespace[pod.Namespace] = append(podsByNamespace[pod.Namespace], pod)
	}

	for _, item := range services.Items {
		matchingPods := 0
		if len(item.Spec.Selector) > 0 {
			for _, pod := range podsByNamespace[item.Namespace] {
				if matchesLabels(item.Spec.Selector, pod.Labels) {
					matchingPods++
				}
			}
		}

		b.addResource(item.UID, TopologyResource{
			ID:           resourceID("Service", item.Namespace, item.Name),
			Kind:         "Service",
			Name:         item.Name,
			Namespace:    item.Namespace,
			InstanceName: instanceName(item.Labels),
			Source:       TopologySourceNetwork,
			Status:       serviceStatus(item, matchingPods, b.warningCount("Service", item.Namespace, item.Name)),
			Summary:      serviceSummary(item),
			DetailLines:  []string{fmt.Sprintf("Type: %s", item.Spec.Type), fmt.Sprintf("Ports: %s", servicePorts(item))},
			Tags:         []string{"core/v1"},
			Weight:       topologyWeight("Service"),
			Warnings:     b.warningCount("Service", item.Namespace, item.Name),
		})

		if len(item.Spec.Selector) == 0 {
			continue
		}

		serviceID := resourceID("Service", item.Namespace, item.Name)
		targets := make(map[string]struct{})
		for _, pod := range podsByNamespace[item.Namespace] {
			podID := resourceID("Pod", pod.Namespace, pod.Name)
			if !b.hasResource(podID) {
				continue
			}
			if matchesLabels(item.Spec.Selector, pod.Labels) {
				targets[podID] = struct{}{}
			}
		}

		for targetID := range targets {
			b.addRelation(serviceID, targetID, "selects")
		}
	}

	for _, item := range ingresses.Items {
		b.addResource(item.UID, TopologyResource{
			ID:           resourceID("Ingress", item.Namespace, item.Name),
			Kind:         "Ingress",
			Name:         item.Name,
			Namespace:    item.Namespace,
			InstanceName: instanceName(item.Labels),
			Source:       TopologySourceNetwork,
			Status:       ingressStatus(item, b.warningCount("Ingress", item.Namespace, item.Name)),
			Summary:      ingressSummary(item),
			DetailLines:  []string{fmt.Sprintf("IngressClass: %s", defaultString(ptrString(item.Spec.IngressClassName), "-")), fmt.Sprintf("Backends: %d", ingressBackendCount(item))},
			Tags:         []string{"networking.k8s.io/v1"},
			Weight:       topologyWeight("Ingress"),
			Warnings:     b.warningCount("Ingress", item.Namespace, item.Name),
		})

		ingressID := resourceID("Ingress", item.Namespace, item.Name)
		for _, serviceName := range ingressServiceNames(item) {
			serviceID := resourceID("Service", item.Namespace, serviceName)
			if !b.hasResource(serviceID) {
				continue
			}
			b.addRelation(ingressID, serviceID, "routes to")
		}
	}

	return nil
}

func (b *topologyBuilder) loadStorage(
	ctx context.Context,
	service *ClusterService,
	namespace string,
	pods []corev1.Pod,
) error {
	claims, err := service.client.Kubernetes.CoreV1().PersistentVolumeClaims(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("list persistentvolumeclaims: %w", err)
	}

	for _, item := range claims.Items {
		b.addResource(item.UID, TopologyResource{
			ID:           resourceID("PersistentVolumeClaim", item.Namespace, item.Name),
			Kind:         "PersistentVolumeClaim",
			Name:         item.Name,
			Namespace:    item.Namespace,
			InstanceName: instanceName(item.Labels),
			Source:       TopologySourceStorage,
			Status:       pvcStatus(item, b.warningCount("PersistentVolumeClaim", item.Namespace, item.Name)),
			Summary:      pvcSummary(item),
			DetailLines:  []string{fmt.Sprintf("StorageClass: %s", defaultString(ptrString(item.Spec.StorageClassName), "-")), fmt.Sprintf("Volume: %s", defaultString(item.Spec.VolumeName, "-"))},
			Tags:         []string{"core/v1"},
			Weight:       topologyWeight("PersistentVolumeClaim"),
			Warnings:     b.warningCount("PersistentVolumeClaim", item.Namespace, item.Name),
		})
	}

	for _, pod := range pods {
		podID := resourceID("Pod", pod.Namespace, pod.Name)
		for _, volume := range pod.Spec.Volumes {
			if volume.PersistentVolumeClaim == nil {
				continue
			}

			pvcID := resourceID("PersistentVolumeClaim", pod.Namespace, volume.PersistentVolumeClaim.ClaimName)
			if !b.hasResource(podID) || !b.hasResource(pvcID) {
				continue
			}

			b.addRelation(pvcID, podID, "mounted by")
		}
	}

	return nil
}

func (b *topologyBuilder) addOwnerRelations(pods []corev1.Pod) {
	for _, pod := range pods {
		podID := resourceID("Pod", pod.Namespace, pod.Name)
		if !b.hasResource(podID) {
			continue
		}

		for _, owner := range pod.OwnerReferences {
			ownerID, ok := b.resourceByUID[owner.UID]
			if !ok {
				continue
			}
			b.ownerByUID[pod.UID] = owner.UID
			b.addRelation(podID, ownerID, "owned by")
		}
	}
}

func (b *topologyBuilder) addResource(uid types.UID, resource TopologyResource) {
	if _, exists := b.resourceIndex[resource.ID]; exists {
		return
	}

	b.resources = append(b.resources, resource)
	b.resourceIndex[resource.ID] = resource
	if uid != "" {
		b.resourceByUID[uid] = resource.ID
	}
}

func (b *topologyBuilder) addRelation(source string, target string, label string) {
	if source == "" || target == "" || source == target {
		return
	}

	id := fmt.Sprintf("%s->%s:%s", source, target, label)
	if _, exists := b.relationIndex[id]; exists {
		return
	}

	b.relationIndex[id] = struct{}{}
	b.relations = append(b.relations, TopologyRelation{
		ID:     id,
		Source: source,
		Target: target,
		Label:  label,
	})
}

func (b *topologyBuilder) hasResource(id string) bool {
	_, ok := b.resourceIndex[id]
	return ok
}

func (b *topologyBuilder) warningCount(kind string, namespace string, name string) int {
	return b.warnings[warningKey(kind, namespace, name)]
}

func (b *topologyBuilder) sort() {
	sort.Slice(b.resources, func(i, j int) bool {
		left := b.resources[i]
		right := b.resources[j]
		if left.Namespace != right.Namespace {
			return left.Namespace < right.Namespace
		}
		if left.Weight != right.Weight {
			return left.Weight > right.Weight
		}
		if left.Kind != right.Kind {
			return left.Kind < right.Kind
		}
		return left.Name < right.Name
	})

	sort.Slice(b.relations, func(i, j int) bool {
		return b.relations[i].ID < b.relations[j].ID
	})
}

func normalizeTopologySources(sources []string) map[string]bool {
	selected := make(map[string]bool)
	for _, source := range sources {
		value := strings.ToLower(strings.TrimSpace(source))
		switch value {
		case TopologySourceWorkloads, TopologySourceNetwork, TopologySourceStorage:
			selected[value] = true
		}
	}

	if len(selected) == 0 {
		selected[TopologySourceWorkloads] = true
		selected[TopologySourceNetwork] = true
		selected[TopologySourceStorage] = true
	}

	return selected
}

func warningKey(kind string, namespace string, name string) string {
	return strings.ToLower(strings.Join([]string{kind, namespace, name}, "/"))
}

func resourceID(kind string, namespace string, name string) string {
	return strings.ToLower(strings.Join([]string{kind, namespace, name}, ":"))
}

func instanceName(labels map[string]string) string {
	if labels == nil {
		return ""
	}

	return labels["app.kubernetes.io/instance"]
}

func matchesLabels(selector map[string]string, labels map[string]string) bool {
	if len(selector) == 0 {
		return false
	}
	for key, value := range selector {
		if labels[key] != value {
			return false
		}
	}
	return true
}

func desiredReplicas(value *int32) int32 {
	if value == nil {
		return 1
	}
	return *value
}

func podReadySummary(item corev1.Pod) string {
	ready := 0
	total := len(item.Status.ContainerStatuses)
	for _, status := range item.Status.ContainerStatuses {
		if status.Ready {
			ready++
		}
	}
	return fmt.Sprintf("%d/%d", ready, total)
}

func podRestartCount(item corev1.Pod) int32 {
	var count int32
	for _, status := range item.Status.ContainerStatuses {
		count += status.RestartCount
	}
	return count
}

func podSummary(item corev1.Pod) string {
	return fmt.Sprintf("%s • Ready %s", string(item.Status.Phase), podReadySummary(item))
}

func podStatus(item corev1.Pod, warnings int) string {
	switch item.Status.Phase {
	case corev1.PodFailed:
		return TopologyStatusError
	case corev1.PodPending:
		if warnings > 0 {
			return TopologyStatusWarning
		}
	}

	ready := 0
	total := len(item.Status.ContainerStatuses)
	for _, status := range item.Status.ContainerStatuses {
		if status.Ready {
			ready++
		}
	}

	if total > 0 && ready < total {
		return TopologyStatusWarning
	}
	if warnings > 0 {
		return TopologyStatusWarning
	}
	return TopologyStatusHealthy
}

func deploymentStatus(item appsv1.Deployment, warnings int) string {
	desired := desiredReplicas(item.Spec.Replicas)
	if desired > 0 && item.Status.AvailableReplicas == 0 {
		if warnings > 0 || item.Status.UnavailableReplicas > 0 {
			return TopologyStatusError
		}
	}
	if item.Status.ReadyReplicas < desired || item.Status.UnavailableReplicas > 0 || warnings > 0 {
		return TopologyStatusWarning
	}
	return TopologyStatusHealthy
}

func statefulSetStatus(item appsv1.StatefulSet, warnings int) string {
	desired := desiredReplicas(item.Spec.Replicas)
	if desired > 0 && item.Status.ReadyReplicas == 0 && warnings > 0 {
		return TopologyStatusError
	}
	if item.Status.ReadyReplicas < desired || warnings > 0 {
		return TopologyStatusWarning
	}
	return TopologyStatusHealthy
}

func daemonSetStatus(item appsv1.DaemonSet, warnings int) string {
	if item.Status.DesiredNumberScheduled > 0 && item.Status.NumberReady == 0 && warnings > 0 {
		return TopologyStatusError
	}
	if item.Status.NumberReady < item.Status.DesiredNumberScheduled || item.Status.NumberUnavailable > 0 || warnings > 0 {
		return TopologyStatusWarning
	}
	return TopologyStatusHealthy
}

func replicaSetStatus(item appsv1.ReplicaSet, warnings int) string {
	desired := desiredReplicas(item.Spec.Replicas)
	if desired > 0 && item.Status.ReadyReplicas == 0 && warnings > 0 {
		return TopologyStatusError
	}
	if item.Status.ReadyReplicas < desired || warnings > 0 {
		return TopologyStatusWarning
	}
	return TopologyStatusHealthy
}

func jobStatus(item batchv1.Job, warnings int) string {
	if item.Status.Failed > 0 && item.Status.Succeeded == 0 && item.Status.Active == 0 {
		return TopologyStatusError
	}
	if item.Status.Failed > 0 || warnings > 0 {
		return TopologyStatusWarning
	}
	return TopologyStatusHealthy
}

func cronJobStatus(item batchv1.CronJob, warnings int) string {
	if item.Spec.Suspend != nil && *item.Spec.Suspend {
		return TopologyStatusWarning
	}
	if warnings > 0 {
		return TopologyStatusWarning
	}
	return TopologyStatusHealthy
}

func serviceStatus(item corev1.Service, matchingPods int, warnings int) string {
	if len(item.Spec.Ports) == 0 {
		return TopologyStatusWarning
	}
	if len(item.Spec.Selector) > 0 && matchingPods == 0 {
		if warnings > 0 {
			return TopologyStatusError
		}
		return TopologyStatusWarning
	}
	if warnings > 0 {
		return TopologyStatusWarning
	}
	return TopologyStatusHealthy
}

func ingressStatus(item networkingv1.Ingress, warnings int) string {
	if ingressBackendCount(item) == 0 {
		return TopologyStatusWarning
	}
	if warnings > 0 {
		return TopologyStatusWarning
	}
	return TopologyStatusHealthy
}

func pvcStatus(item corev1.PersistentVolumeClaim, warnings int) string {
	switch item.Status.Phase {
	case corev1.ClaimLost:
		return TopologyStatusError
	case corev1.ClaimPending:
		return TopologyStatusWarning
	}
	if warnings > 0 {
		return TopologyStatusWarning
	}
	return TopologyStatusHealthy
}

func serviceSummary(item corev1.Service) string {
	switch item.Spec.Type {
	case corev1.ServiceTypeExternalName:
		return fmt.Sprintf("ExternalName %s", item.Spec.ExternalName)
	case corev1.ServiceTypeNodePort:
		return fmt.Sprintf("NodePort %s", servicePorts(item))
	default:
		clusterIP := item.Spec.ClusterIP
		if clusterIP == "" {
			clusterIP = "None"
		}
		return fmt.Sprintf("ClusterIP %s", clusterIP)
	}
}

func servicePorts(item corev1.Service) string {
	parts := make([]string, 0, len(item.Spec.Ports))
	for _, port := range item.Spec.Ports {
		if port.NodePort > 0 {
			parts = append(parts, fmt.Sprintf("%d:%d/%s", port.Port, port.NodePort, strings.ToLower(string(port.Protocol))))
			continue
		}
		parts = append(parts, fmt.Sprintf("%d/%s", port.Port, strings.ToLower(string(port.Protocol))))
	}
	if len(parts) == 0 {
		return "-"
	}
	return strings.Join(parts, ", ")
}

func ingressSummary(item networkingv1.Ingress) string {
	hosts := make([]string, 0, len(item.Spec.Rules))
	for _, rule := range item.Spec.Rules {
		if strings.TrimSpace(rule.Host) != "" {
			hosts = append(hosts, rule.Host)
		}
	}
	if len(hosts) == 0 {
		return fmt.Sprintf("%d backends", ingressBackendCount(item))
	}
	if len(hosts) == 1 {
		return hosts[0]
	}
	return fmt.Sprintf("%s +%d", hosts[0], len(hosts)-1)
}

func ingressBackendCount(item networkingv1.Ingress) int {
	count := 0
	if item.Spec.DefaultBackend != nil && item.Spec.DefaultBackend.Service != nil {
		count++
	}
	for _, rule := range item.Spec.Rules {
		if rule.HTTP == nil {
			continue
		}
		for _, path := range rule.HTTP.Paths {
			if path.Backend.Service != nil {
				count++
			}
		}
	}
	return count
}

func ingressServiceNames(item networkingv1.Ingress) []string {
	names := make(map[string]struct{})
	if item.Spec.DefaultBackend != nil && item.Spec.DefaultBackend.Service != nil {
		names[item.Spec.DefaultBackend.Service.Name] = struct{}{}
	}
	for _, rule := range item.Spec.Rules {
		if rule.HTTP == nil {
			continue
		}
		for _, path := range rule.HTTP.Paths {
			if path.Backend.Service != nil {
				names[path.Backend.Service.Name] = struct{}{}
			}
		}
	}

	result := make([]string, 0, len(names))
	for name := range names {
		result = append(result, name)
	}
	sort.Strings(result)
	return result
}

func pvcSummary(item corev1.PersistentVolumeClaim) string {
	size := "-"
	if quantity, ok := item.Spec.Resources.Requests[corev1.ResourceStorage]; ok {
		size = quantity.String()
	}
	return fmt.Sprintf("%s • %s", item.Status.Phase, size)
}

func jobCompletions(item batchv1.Job) string {
	if item.Spec.Completions == nil {
		return "1"
	}
	return fmt.Sprintf("%d", *item.Spec.Completions)
}

func defaultString(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func ptrString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func topologyWeight(kind string) int {
	switch kind {
	case "Deployment":
		return 980
	case "StatefulSet", "DaemonSet", "CronJob":
		return 960
	case "ReplicaSet":
		return 940
	case "Job":
		return 920
	case "Pod":
		return 800
	case "Service", "PersistentVolumeClaim":
		return 790
	case "Ingress":
		return 780
	default:
		return 500
	}
}

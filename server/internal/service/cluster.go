package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"sort"
	"strings"
	"time"

	yamlv3 "gopkg.in/yaml.v3"
	appsv1 "k8s.io/api/apps/v1"
	authv1 "k8s.io/api/authentication/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	storagev1 "k8s.io/api/storage/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/types"
	utilretry "k8s.io/client-go/util/retry"
	metricsv1beta1 "k8s.io/metrics/pkg/apis/metrics/v1beta1"
	"sigs.k8s.io/yaml"

	"github.com/zhangya/k8s-admin/server/internal/jsonx"
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
	Name               string                         `json:"name"`
	Role               string                         `json:"role"`
	IP                 string                         `json:"ip"`
	Status             string                         `json:"status"`
	Ready              bool                           `json:"ready"`
	Schedulable        bool                           `json:"schedulable"`
	Kubelet            string                         `json:"kubeletVersion"`
	OSImage            string                         `json:"osImage"`
	Kernel             string                         `json:"kernelVersion"`
	ContainerRT        string                         `json:"containerRuntime"`
	Architecture       string                         `json:"architecture"`
	PodCount           int                            `json:"podCount"`
	Age                string                         `json:"age"`
	CreatedAt          string                         `json:"createdAt"`
	MetricsAvailable   bool                           `json:"metricsAvailable"`
	CPUUsage           string                         `json:"cpuUsage,omitempty"`
	CPUUsagePercent    float64                        `json:"cpuUsagePercent"`
	MemoryUsage        string                         `json:"memoryUsage,omitempty"`
	MemoryUsagePercent float64                        `json:"memoryUsagePercent"`
	CPUAllocatable     string                         `json:"cpuAllocatable"`
	MemoryAllocatable  string                         `json:"memoryAllocatable"`
	Conditions         jsonx.Slice[NodeConditionItem] `json:"conditions"`
	Taints             jsonx.Slice[NodeTaintItem]     `json:"taints"`
	Labels             jsonx.Slice[string]            `json:"labels"`
}

type NodeConditionItem struct {
	Type               string `json:"type"`
	Status             string `json:"status"`
	Reason             string `json:"reason,omitempty"`
	Message            string `json:"message,omitempty"`
	LastTransitionTime string `json:"lastTransitionTime,omitempty"`
}

type NodeTaintItem struct {
	Key    string `json:"key"`
	Value  string `json:"value,omitempty"`
	Effect string `json:"effect"`
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

type NamespaceItem struct {
	Name      string              `json:"name"`
	Status    string              `json:"status"`
	Labels    jsonx.Slice[string] `json:"labels"`
	Pods      int                 `json:"pods"`
	Services  int                 `json:"services"`
	Age       string              `json:"age"`
	CreatedAt string              `json:"createdAt"`
}

type PodItem struct {
	Name             string                        `json:"name"`
	Namespace        string                        `json:"namespace"`
	Status           string                        `json:"status"`
	Phase            string                        `json:"phase"`
	ReadyContainers  int                           `json:"readyContainers"`
	TotalContainers  int                           `json:"totalContainers"`
	RestartCount     int                           `json:"restartCount"`
	NodeName         string                        `json:"nodeName"`
	PodIP            string                        `json:"podIP"`
	QOSClass         string                        `json:"qosClass"`
	Age              string                        `json:"age"`
	CreatedAt        string                        `json:"createdAt"`
	MetricsAvailable bool                          `json:"metricsAvailable"`
	CPUUsage         string                        `json:"cpuUsage,omitempty"`
	MemoryUsage      string                        `json:"memoryUsage,omitempty"`
	OwnerKind        string                        `json:"ownerKind,omitempty"`
	OwnerName        string                        `json:"ownerName,omitempty"`
	Labels           jsonx.Slice[string]           `json:"labels"`
	Containers       jsonx.Slice[PodContainerItem] `json:"containers"`
	Conditions       jsonx.Slice[PodConditionItem] `json:"conditions"`
}

type PodEventItem struct {
	Type     string `json:"type"`
	Reason   string `json:"reason"`
	Message  string `json:"message"`
	Count    int32  `json:"count"`
	LastSeen string `json:"lastSeen"`
}

type PodLogResult struct {
	Namespace   string `json:"namespace"`
	Name        string `json:"name"`
	Container   string `json:"container"`
	Content     string `json:"content"`
	GeneratedAt string `json:"generatedAt"`
}

type ResourceTextResult struct {
	Namespace   string `json:"namespace"`
	Name        string `json:"name"`
	Content     string `json:"content"`
	GeneratedAt string `json:"generatedAt"`
}

type resourceManifestMetadata struct {
	Name      string `yaml:"name"`
	Namespace string `yaml:"namespace"`
}

type resourceManifestIdentity struct {
	APIVersion string                   `yaml:"apiVersion"`
	Kind       string                   `yaml:"kind"`
	Metadata   resourceManifestMetadata `yaml:"metadata"`
}

type PodContainerItem struct {
	Name            string `json:"name"`
	Ready           bool   `json:"ready"`
	RestartCount    int    `json:"restartCount"`
	State           string `json:"state"`
	StateReason     string `json:"stateReason,omitempty"`
	StateMessage    string `json:"stateMessage,omitempty"`
	StartedAt       string `json:"startedAt,omitempty"`
	FinishedAt      string `json:"finishedAt,omitempty"`
	ExitCode        *int32 `json:"exitCode,omitempty"`
	LastState       string `json:"lastState,omitempty"`
	LastStateReason string `json:"lastStateReason,omitempty"`
	LastStartedAt   string `json:"lastStartedAt,omitempty"`
	LastFinishedAt  string `json:"lastFinishedAt,omitempty"`
	LastExitCode    *int32 `json:"lastExitCode,omitempty"`
	Image           string `json:"image,omitempty"`
	CPUUsage        string `json:"cpuUsage,omitempty"`
	MemoryUsage     string `json:"memoryUsage,omitempty"`
}

type PodConditionItem struct {
	Type    string `json:"type"`
	Status  string `json:"status"`
	Reason  string `json:"reason,omitempty"`
	Message string `json:"message,omitempty"`
}

type DeploymentItem struct {
	Name                string                               `json:"name"`
	Namespace           string                               `json:"namespace"`
	Status              string                               `json:"status"`
	DesiredReplicas     int32                                `json:"desiredReplicas"`
	UpdatedReplicas     int32                                `json:"updatedReplicas"`
	ReadyReplicas       int32                                `json:"readyReplicas"`
	AvailableReplicas   int32                                `json:"availableReplicas"`
	UnavailableReplicas int32                                `json:"unavailableReplicas"`
	PodCount            int                                  `json:"podCount"`
	RestartCount        int                                  `json:"restartCount"`
	Strategy            string                               `json:"strategy"`
	Age                 string                               `json:"age"`
	CreatedAt           string                               `json:"createdAt"`
	MetricsAvailable    bool                                 `json:"metricsAvailable"`
	CPUUsage            string                               `json:"cpuUsage,omitempty"`
	MemoryUsage         string                               `json:"memoryUsage,omitempty"`
	Selector            jsonx.Slice[string]                  `json:"selector"`
	Labels              jsonx.Slice[string]                  `json:"labels"`
	Images              jsonx.Slice[string]                  `json:"images"`
	Conditions          jsonx.Slice[DeploymentConditionItem] `json:"conditions"`
	Pods                jsonx.Slice[DeploymentPodItem]       `json:"pods"`
}

type WorkloadActionResult struct {
	Kind      string `json:"kind"`
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Operation string `json:"operation"`
	Message   string `json:"message"`
	Timestamp string `json:"timestamp"`
}

type DeploymentConditionItem struct {
	Type           string `json:"type"`
	Status         string `json:"status"`
	Reason         string `json:"reason,omitempty"`
	Message        string `json:"message,omitempty"`
	LastUpdateTime string `json:"lastUpdateTime,omitempty"`
}

type DeploymentPodItem struct {
	Name             string `json:"name"`
	Status           string `json:"status"`
	ReadyContainers  int    `json:"readyContainers"`
	TotalContainers  int    `json:"totalContainers"`
	RestartCount     int    `json:"restartCount"`
	NodeName         string `json:"nodeName"`
	MetricsAvailable bool   `json:"metricsAvailable"`
	CPUUsage         string `json:"cpuUsage,omitempty"`
	MemoryUsage      string `json:"memoryUsage,omitempty"`
}

type StatefulSetConditionItem = DeploymentConditionItem
type StatefulSetPodItem = DeploymentPodItem
type ReplicaSetConditionItem = DeploymentConditionItem
type ReplicaSetPodItem = DeploymentPodItem
type DaemonSetConditionItem = DeploymentConditionItem
type DaemonSetPodItem = DeploymentPodItem
type JobConditionItem = DeploymentConditionItem
type JobPodItem = DeploymentPodItem

type StatefulSetItem struct {
	Name                string                                `json:"name"`
	Namespace           string                                `json:"namespace"`
	Status              string                                `json:"status"`
	ServiceName         string                                `json:"serviceName"`
	PodManagementPolicy string                                `json:"podManagementPolicy"`
	UpdateStrategy      string                                `json:"updateStrategy"`
	DesiredReplicas     int32                                 `json:"desiredReplicas"`
	ReadyReplicas       int32                                 `json:"readyReplicas"`
	CurrentReplicas     int32                                 `json:"currentReplicas"`
	UpdatedReplicas     int32                                 `json:"updatedReplicas"`
	AvailableReplicas   int32                                 `json:"availableReplicas"`
	PodCount            int                                   `json:"podCount"`
	RestartCount        int                                   `json:"restartCount"`
	Age                 string                                `json:"age"`
	CreatedAt           string                                `json:"createdAt"`
	MetricsAvailable    bool                                  `json:"metricsAvailable"`
	CPUUsage            string                                `json:"cpuUsage,omitempty"`
	MemoryUsage         string                                `json:"memoryUsage,omitempty"`
	CurrentRevision     string                                `json:"currentRevision,omitempty"`
	UpdateRevision      string                                `json:"updateRevision,omitempty"`
	Selector            jsonx.Slice[string]                   `json:"selector"`
	Labels              jsonx.Slice[string]                   `json:"labels"`
	Images              jsonx.Slice[string]                   `json:"images"`
	Conditions          jsonx.Slice[StatefulSetConditionItem] `json:"conditions"`
	Pods                jsonx.Slice[StatefulSetPodItem]       `json:"pods"`
}

type ReplicaSetItem struct {
	Name              string                               `json:"name"`
	Namespace         string                               `json:"namespace"`
	Status            string                               `json:"status"`
	DesiredReplicas   int32                                `json:"desiredReplicas"`
	CurrentReplicas   int32                                `json:"currentReplicas"`
	ReadyReplicas     int32                                `json:"readyReplicas"`
	AvailableReplicas int32                                `json:"availableReplicas"`
	FullyLabeled      int32                                `json:"fullyLabeledReplicas"`
	PodCount          int                                  `json:"podCount"`
	RestartCount      int                                  `json:"restartCount"`
	Age               string                               `json:"age"`
	CreatedAt         string                               `json:"createdAt"`
	MetricsAvailable  bool                                 `json:"metricsAvailable"`
	CPUUsage          string                               `json:"cpuUsage,omitempty"`
	MemoryUsage       string                               `json:"memoryUsage,omitempty"`
	OwnerKind         string                               `json:"ownerKind,omitempty"`
	OwnerName         string                               `json:"ownerName,omitempty"`
	Selector          jsonx.Slice[string]                  `json:"selector"`
	Labels            jsonx.Slice[string]                  `json:"labels"`
	Images            jsonx.Slice[string]                  `json:"images"`
	Conditions        jsonx.Slice[ReplicaSetConditionItem] `json:"conditions"`
	Pods              jsonx.Slice[ReplicaSetPodItem]       `json:"pods"`
}

type DaemonSetItem struct {
	Name                   string                              `json:"name"`
	Namespace              string                              `json:"namespace"`
	Status                 string                              `json:"status"`
	UpdateStrategy         string                              `json:"updateStrategy"`
	DesiredNumberScheduled int32                               `json:"desiredNumberScheduled"`
	CurrentNumberScheduled int32                               `json:"currentNumberScheduled"`
	UpdatedNumberScheduled int32                               `json:"updatedNumberScheduled"`
	NumberReady            int32                               `json:"numberReady"`
	NumberAvailable        int32                               `json:"numberAvailable"`
	NumberUnavailable      int32                               `json:"numberUnavailable"`
	NumberMisscheduled     int32                               `json:"numberMisscheduled"`
	PodCount               int                                 `json:"podCount"`
	RestartCount           int                                 `json:"restartCount"`
	Age                    string                              `json:"age"`
	CreatedAt              string                              `json:"createdAt"`
	MetricsAvailable       bool                                `json:"metricsAvailable"`
	CPUUsage               string                              `json:"cpuUsage,omitempty"`
	MemoryUsage            string                              `json:"memoryUsage,omitempty"`
	Selector               jsonx.Slice[string]                 `json:"selector"`
	Labels                 jsonx.Slice[string]                 `json:"labels"`
	Images                 jsonx.Slice[string]                 `json:"images"`
	Conditions             jsonx.Slice[DaemonSetConditionItem] `json:"conditions"`
	Pods                   jsonx.Slice[DaemonSetPodItem]       `json:"pods"`
}

type JobItem struct {
	Name               string                        `json:"name"`
	Namespace          string                        `json:"namespace"`
	Status             string                        `json:"status"`
	Parallelism        int32                         `json:"parallelism"`
	DesiredCompletions int32                         `json:"desiredCompletions"`
	Active             int32                         `json:"active"`
	Succeeded          int32                         `json:"succeeded"`
	Failed             int32                         `json:"failed"`
	CompletionMode     string                        `json:"completionMode,omitempty"`
	PodCount           int                           `json:"podCount"`
	RestartCount       int                           `json:"restartCount"`
	Age                string                        `json:"age"`
	CreatedAt          string                        `json:"createdAt"`
	MetricsAvailable   bool                          `json:"metricsAvailable"`
	CPUUsage           string                        `json:"cpuUsage,omitempty"`
	MemoryUsage        string                        `json:"memoryUsage,omitempty"`
	StartTime          string                        `json:"startTime,omitempty"`
	CompletionTime     string                        `json:"completionTime,omitempty"`
	OwnerKind          string                        `json:"ownerKind,omitempty"`
	OwnerName          string                        `json:"ownerName,omitempty"`
	Labels             jsonx.Slice[string]           `json:"labels"`
	Images             jsonx.Slice[string]           `json:"images"`
	Conditions         jsonx.Slice[JobConditionItem] `json:"conditions"`
	Pods               jsonx.Slice[JobPodItem]       `json:"pods"`
}

type CronJobJobItem struct {
	Name             string `json:"name"`
	Status           string `json:"status"`
	Active           int32  `json:"active"`
	Succeeded        int32  `json:"succeeded"`
	Failed           int32  `json:"failed"`
	StartTime        string `json:"startTime,omitempty"`
	CompletionTime   string `json:"completionTime,omitempty"`
	MetricsAvailable bool   `json:"metricsAvailable"`
	CPUUsage         string `json:"cpuUsage,omitempty"`
	MemoryUsage      string `json:"memoryUsage,omitempty"`
}

type CronJobItem struct {
	Name                  string                      `json:"name"`
	Namespace             string                      `json:"namespace"`
	Status                string                      `json:"status"`
	Schedule              string                      `json:"schedule"`
	TimeZone              string                      `json:"timeZone,omitempty"`
	Suspend               bool                        `json:"suspend"`
	ConcurrencyPolicy     string                      `json:"concurrencyPolicy"`
	ActiveJobs            int                         `json:"activeJobs"`
	JobCount              int                         `json:"jobCount"`
	PodCount              int                         `json:"podCount"`
	RestartCount          int                         `json:"restartCount"`
	SuccessfulJobsHistory int32                       `json:"successfulJobsHistory"`
	FailedJobsHistory     int32                       `json:"failedJobsHistory"`
	Age                   string                      `json:"age"`
	CreatedAt             string                      `json:"createdAt"`
	MetricsAvailable      bool                        `json:"metricsAvailable"`
	CPUUsage              string                      `json:"cpuUsage,omitempty"`
	MemoryUsage           string                      `json:"memoryUsage,omitempty"`
	LastScheduleTime      string                      `json:"lastScheduleTime,omitempty"`
	LastSuccessfulTime    string                      `json:"lastSuccessfulTime,omitempty"`
	Labels                jsonx.Slice[string]         `json:"labels"`
	Images                jsonx.Slice[string]         `json:"images"`
	Jobs                  jsonx.Slice[CronJobJobItem] `json:"jobs"`
}

type ServicePortItem struct {
	Name       string `json:"name,omitempty"`
	Protocol   string `json:"protocol"`
	Port       int32  `json:"port"`
	TargetPort string `json:"targetPort,omitempty"`
	NodePort   int32  `json:"nodePort,omitempty"`
}

type ServiceItem struct {
	Name              string                       `json:"name"`
	Namespace         string                       `json:"namespace"`
	Status            string                       `json:"status"`
	Type              string                       `json:"type"`
	Summary           string                       `json:"summary"`
	ClusterIP         string                       `json:"clusterIP"`
	ExternalName      string                       `json:"externalName,omitempty"`
	ExternalAddresses jsonx.Slice[string]          `json:"externalAddresses"`
	SessionAffinity   string                       `json:"sessionAffinity"`
	PortsSummary      string                       `json:"portsSummary"`
	PodCount          int                          `json:"podCount"`
	Selector          jsonx.Slice[string]          `json:"selector"`
	Ports             jsonx.Slice[ServicePortItem] `json:"ports"`
	Labels            jsonx.Slice[string]          `json:"labels"`
	Age               string                       `json:"age"`
	CreatedAt         string                       `json:"createdAt"`
}

type IngressTLSItem struct {
	SecretName string              `json:"secretName,omitempty"`
	Hosts      jsonx.Slice[string] `json:"hosts"`
}

type IngressItem struct {
	Name           string                      `json:"name"`
	Namespace      string                      `json:"namespace"`
	Status         string                      `json:"status"`
	IngressClass   string                      `json:"ingressClass,omitempty"`
	Summary        string                      `json:"summary"`
	Hosts          jsonx.Slice[string]         `json:"hosts"`
	Addresses      jsonx.Slice[string]         `json:"addresses"`
	ServiceNames   jsonx.Slice[string]         `json:"serviceNames"`
	DefaultBackend string                      `json:"defaultBackend,omitempty"`
	BackendCount   int                         `json:"backendCount"`
	TLS            jsonx.Slice[IngressTLSItem] `json:"tls"`
	Labels         jsonx.Slice[string]         `json:"labels"`
	Age            string                      `json:"age"`
	CreatedAt      string                      `json:"createdAt"`
}

type IngressClassParameterRefItem struct {
	APIGroup  string `json:"apiGroup,omitempty"`
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Scope     string `json:"scope,omitempty"`
	Namespace string `json:"namespace,omitempty"`
}

type IngressClassItem struct {
	Name       string                        `json:"name"`
	Status     string                        `json:"status"`
	Controller string                        `json:"controller"`
	IsDefault  bool                          `json:"isDefault"`
	Parameters *IngressClassParameterRefItem `json:"parameters,omitempty"`
	Labels     jsonx.Slice[string]           `json:"labels"`
	Age        string                        `json:"age"`
	CreatedAt  string                        `json:"createdAt"`
}

type NetworkPolicyRuleItem struct {
	Peers jsonx.Slice[string] `json:"peers"`
	Ports jsonx.Slice[string] `json:"ports"`
}

type NetworkPolicyItem struct {
	Name             string                             `json:"name"`
	Namespace        string                             `json:"namespace"`
	Status           string                             `json:"status"`
	Summary          string                             `json:"summary"`
	PodSelector      jsonx.Slice[string]                `json:"podSelector"`
	PolicyTypes      jsonx.Slice[string]                `json:"policyTypes"`
	SelectedPodCount int                                `json:"selectedPodCount"`
	SelectedPods     jsonx.Slice[string]                `json:"selectedPods"`
	IngressRuleCount int                                `json:"ingressRuleCount"`
	EgressRuleCount  int                                `json:"egressRuleCount"`
	IngressRules     jsonx.Slice[NetworkPolicyRuleItem] `json:"ingressRules"`
	EgressRules      jsonx.Slice[NetworkPolicyRuleItem] `json:"egressRules"`
	Labels           jsonx.Slice[string]                `json:"labels"`
	Age              string                             `json:"age"`
	CreatedAt        string                             `json:"createdAt"`
}

type PersistentVolumeClaimItem struct {
	Name             string              `json:"name"`
	Namespace        string              `json:"namespace"`
	Status           string              `json:"status"`
	Summary          string              `json:"summary"`
	StorageClass     string              `json:"storageClass"`
	VolumeName       string              `json:"volumeName,omitempty"`
	VolumeMode       string              `json:"volumeMode"`
	AccessModes      jsonx.Slice[string] `json:"accessModes"`
	RequestedStorage string              `json:"requestedStorage"`
	Capacity         string              `json:"capacity,omitempty"`
	MountedPodCount  int                 `json:"mountedPodCount"`
	MountedPods      jsonx.Slice[string] `json:"mountedPods"`
	Labels           jsonx.Slice[string] `json:"labels"`
	Age              string              `json:"age"`
	CreatedAt        string              `json:"createdAt"`
}

type EndpointAddressItem struct {
	IP         string `json:"ip"`
	Ready      bool   `json:"ready"`
	NodeName   string `json:"nodeName,omitempty"`
	TargetKind string `json:"targetKind,omitempty"`
	TargetName string `json:"targetName,omitempty"`
}

type EndpointItem struct {
	Name              string                           `json:"name"`
	Namespace         string                           `json:"namespace"`
	Status            string                           `json:"status"`
	ServiceName       string                           `json:"serviceName,omitempty"`
	Subsets           int                              `json:"subsets"`
	ReadyAddresses    int                              `json:"readyAddresses"`
	NotReadyAddresses int                              `json:"notReadyAddresses"`
	PortsSummary      string                           `json:"portsSummary"`
	Addresses         jsonx.Slice[EndpointAddressItem] `json:"addresses"`
	Labels            jsonx.Slice[string]              `json:"labels"`
	Age               string                           `json:"age"`
	CreatedAt         string                           `json:"createdAt"`
}

type PersistentVolumeItem struct {
	Name           string              `json:"name"`
	Status         string              `json:"status"`
	Phase          string              `json:"phase"`
	Capacity       string              `json:"capacity"`
	AccessModes    jsonx.Slice[string] `json:"accessModes"`
	ReclaimPolicy  string              `json:"reclaimPolicy"`
	StorageClass   string              `json:"storageClass"`
	VolumeMode     string              `json:"volumeMode"`
	ClaimNamespace string              `json:"claimNamespace,omitempty"`
	ClaimName      string              `json:"claimName,omitempty"`
	Source         string              `json:"source"`
	Labels         jsonx.Slice[string] `json:"labels"`
	Age            string              `json:"age"`
	CreatedAt      string              `json:"createdAt"`
}

type StorageClassItem struct {
	Name                 string              `json:"name"`
	Status               string              `json:"status"`
	Provisioner          string              `json:"provisioner"`
	ReclaimPolicy        string              `json:"reclaimPolicy"`
	VolumeBindingMode    string              `json:"volumeBindingMode"`
	AllowVolumeExpansion bool                `json:"allowVolumeExpansion"`
	IsDefault            bool                `json:"isDefault"`
	Parameters           jsonx.Slice[string] `json:"parameters"`
	Labels               jsonx.Slice[string] `json:"labels"`
	Age                  string              `json:"age"`
	CreatedAt            string              `json:"createdAt"`
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

	sort.Strings(namespaces)

	return namespaces, nil
}

func (s *ClusterService) ListNamespaceItems(ctx context.Context) ([]NamespaceItem, error) {
	namespaces, err := s.client.Kubernetes.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list namespaces: %w", err)
	}

	pods, err := s.client.Kubernetes.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list pods for namespaces: %w", err)
	}

	services, err := s.client.Kubernetes.CoreV1().Services("").List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list services for namespaces: %w", err)
	}

	podCounts := make(map[string]int)
	for _, item := range pods.Items {
		podCounts[item.Namespace]++
	}

	serviceCounts := make(map[string]int)
	for _, item := range services.Items {
		serviceCounts[item.Namespace]++
	}

	result := make([]NamespaceItem, 0, len(namespaces.Items))
	for _, item := range namespaces.Items {
		result = append(result, NamespaceItem{
			Name:      item.Name,
			Status:    namespaceStatus(item),
			Labels:    jsonx.Slice[string](labelPairs(item.Labels)),
			Pods:      podCounts[item.Name],
			Services:  serviceCounts[item.Name],
			Age:       ageString(item.CreationTimestamp.Time),
			CreatedAt: item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})

	return result, nil
}

func (s *ClusterService) ListNodes(ctx context.Context) ([]NodeItem, error) {
	items, err := s.client.Kubernetes.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list nodes: %w", err)
	}

	podCounts := make(map[string]int)
	if pods, err := s.client.Kubernetes.CoreV1().Pods("").List(ctx, metav1.ListOptions{}); err == nil {
		podCounts = nodePodCounts(pods.Items)
	}

	metricsByNodeName := make(map[string]metricsv1beta1.NodeMetrics)
	if nodeMetrics, err := s.client.Metrics.MetricsV1beta1().NodeMetricses().List(ctx, metav1.ListOptions{}); err == nil {
		metricsByNodeName = nodeMetricsIndex(nodeMetrics.Items)
	}

	nodes := make([]NodeItem, 0, len(items.Items))
	for _, item := range items.Items {
		allocatableCPUQuantity := item.Status.Allocatable.Cpu()
		allocatableMemoryQuantity := item.Status.Allocatable.Memory()
		allocatableCPU := formatMilliCPUQuantity(allocatableCPUQuantity)
		allocatableMemory := formatBinaryQuantity(allocatableMemoryQuantity)
		ready := isNodeReady(item)
		schedulable := !item.Spec.Unschedulable
		nodeItem := NodeItem{
			Name:              item.Name,
			Role:              nodeRole(item),
			IP:                internalIP(item),
			Status:            readyStatus(item),
			Ready:             ready,
			Schedulable:       schedulable,
			Kubelet:           item.Status.NodeInfo.KubeletVersion,
			OSImage:           item.Status.NodeInfo.OSImage,
			Kernel:            item.Status.NodeInfo.KernelVersion,
			ContainerRT:       item.Status.NodeInfo.ContainerRuntimeVersion,
			Architecture:      item.Status.NodeInfo.Architecture,
			PodCount:          podCounts[item.Name],
			Age:               ageString(item.CreationTimestamp.Time),
			CreatedAt:         item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
			CPUAllocatable:    allocatableCPU,
			MemoryAllocatable: allocatableMemory,
			Conditions:        jsonx.Slice[NodeConditionItem](collectNodeConditions(item)),
			Taints:            jsonx.Slice[NodeTaintItem](collectNodeTaints(item)),
			Labels:            jsonx.Slice[string](labelPairs(item.Labels)),
		}

		if metrics, ok := metricsByNodeName[item.Name]; ok {
			nodeItem.MetricsAvailable = true
			nodeItem.CPUUsage = fmt.Sprintf(
				"%s / %s",
				formatMilliCPUQuantity(metrics.Usage.Cpu()),
				allocatableCPU,
			)
			nodeItem.CPUUsagePercent = percentageValue(
				metrics.Usage.Cpu().MilliValue(),
				quantityMilliValue(allocatableCPUQuantity),
			)
			nodeItem.MemoryUsage = fmt.Sprintf(
				"%s / %s",
				formatBinaryQuantity(metrics.Usage.Memory()),
				allocatableMemory,
			)
			nodeItem.MemoryUsagePercent = percentageValue(
				metrics.Usage.Memory().Value(),
				quantityValue(allocatableMemoryQuantity),
			)
		}

		nodes = append(nodes, nodeItem)
	}

	sort.Slice(nodes, func(i, j int) bool {
		if nodes[i].Role != nodes[j].Role {
			return nodeRoleOrder(nodes[i].Role) < nodeRoleOrder(nodes[j].Role)
		}
		return nodes[i].Name < nodes[j].Name
	})

	return nodes, nil
}

func (s *ClusterService) ListPods(ctx context.Context, namespace string) ([]PodItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list pods: %w", err)
	}

	metricsByPod := make(map[string]metricsv1beta1.PodMetrics)
	if podMetrics, err := s.client.Metrics.MetricsV1beta1().PodMetricses(namespace).List(ctx, metav1.ListOptions{}); err == nil {
		metricsByPod = podMetricsIndex(podMetrics.Items)
	}

	pods := make([]PodItem, 0, len(items.Items))
	for _, item := range items.Items {
		ownerKind, ownerName := podOwner(item)
		podMetrics := metricsByPod[podMetricsKey(item.Namespace, item.Name)]
		containers, cpuUsage, memoryUsage, metricsAvailable := collectPodContainers(item, podMetrics)

		pods = append(pods, PodItem{
			Name:             item.Name,
			Namespace:        item.Namespace,
			Status:           podListStatus(item),
			Phase:            string(item.Status.Phase),
			ReadyContainers:  podReadyContainerCount(item),
			TotalContainers:  len(item.Spec.Containers),
			RestartCount:     podListRestartCount(item),
			NodeName:         item.Spec.NodeName,
			PodIP:            item.Status.PodIP,
			QOSClass:         string(item.Status.QOSClass),
			Age:              ageString(item.CreationTimestamp.Time),
			CreatedAt:        item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
			MetricsAvailable: metricsAvailable,
			CPUUsage:         cpuUsage,
			MemoryUsage:      memoryUsage,
			OwnerKind:        ownerKind,
			OwnerName:        ownerName,
			Labels:           jsonx.Slice[string](labelPairs(item.Labels)),
			Containers:       jsonx.Slice[PodContainerItem](containers),
			Conditions:       jsonx.Slice[PodConditionItem](collectPodConditions(item)),
		})
	}

	sort.Slice(pods, func(i, j int) bool {
		leftOrder := podStatusOrder(pods[i].Status)
		rightOrder := podStatusOrder(pods[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if pods[i].Namespace != pods[j].Namespace {
			return pods[i].Namespace < pods[j].Namespace
		}
		return pods[i].Name < pods[j].Name
	})

	return pods, nil
}

func (s *ClusterService) DeletePod(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)

	if namespace == "" {
		return WorkloadActionResult{}, fmt.Errorf("pod namespace is required")
	}
	if name == "" {
		return WorkloadActionResult{}, fmt.Errorf("pod name is required")
	}

	if err := s.client.Kubernetes.CoreV1().Pods(namespace).Delete(ctx, name, metav1.DeleteOptions{}); err != nil {
		return WorkloadActionResult{}, fmt.Errorf("delete pod %s/%s: %w", namespace, name, err)
	}

	return WorkloadActionResult{
		Kind:      "Pod",
		Namespace: namespace,
		Name:      name,
		Operation: "delete",
		Message:   "Pod 删除请求已提交",
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
	}, nil
}

func (s *ClusterService) ListPodEvents(
	ctx context.Context,
	namespace string,
	name string,
) ([]PodEventItem, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)

	if namespace == "" {
		return nil, fmt.Errorf("pod namespace is required")
	}
	if name == "" {
		return nil, fmt.Errorf("pod name is required")
	}

	items, err := s.client.Kubernetes.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list pod events for %s/%s: %w", namespace, name, err)
	}

	events := make([]corev1.Event, 0, len(items.Items))
	for _, item := range items.Items {
		if item.InvolvedObject.Kind == "Pod" && item.InvolvedObject.Name == name {
			events = append(events, item)
		}
	}

	sort.Slice(events, func(i, j int) bool {
		return eventTimestamp(events[i]).After(eventTimestamp(events[j]))
	})

	result := make([]PodEventItem, 0, len(events))
	for _, item := range events {
		result = append(result, PodEventItem{
			Type:     item.Type,
			Reason:   item.Reason,
			Message:  item.Message,
			Count:    item.Count,
			LastSeen: eventTimestamp(item).Format("2006-01-02 15:04:05"),
		})
	}

	return result, nil
}

func (s *ClusterService) GetPodLogs(
	ctx context.Context,
	namespace string,
	name string,
	container string,
	tailLines int64,
) (PodLogResult, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)
	container = strings.TrimSpace(container)

	if namespace == "" {
		return PodLogResult{}, fmt.Errorf("pod namespace is required")
	}
	if name == "" {
		return PodLogResult{}, fmt.Errorf("pod name is required")
	}

	pod, err := s.client.Kubernetes.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return PodLogResult{}, fmt.Errorf("get pod %s/%s: %w", namespace, name, err)
	}

	if container == "" {
		if len(pod.Spec.Containers) == 0 {
			return PodLogResult{}, fmt.Errorf("pod %s/%s has no containers", namespace, name)
		}
		container = pod.Spec.Containers[0].Name
	}

	options := &corev1.PodLogOptions{
		Container: container,
	}
	if tailLines > 0 {
		options.TailLines = &tailLines
	}

	raw, err := s.client.Kubernetes.CoreV1().Pods(namespace).GetLogs(name, options).DoRaw(ctx)
	if err != nil {
		return PodLogResult{}, fmt.Errorf("get pod logs for %s/%s container %s: %w", namespace, name, container, err)
	}

	return PodLogResult{
		Namespace:   namespace,
		Name:        name,
		Container:   container,
		Content:     string(raw),
		GeneratedAt: time.Now().Format("2006-01-02 15:04:05"),
	}, nil
}

func (s *ClusterService) GetPodYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "pod", "Pod", namespace, name)
}

func (s *ClusterService) GetPodDescribe(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)

	if namespace == "" {
		return ResourceTextResult{}, fmt.Errorf("pod namespace is required")
	}
	if name == "" {
		return ResourceTextResult{}, fmt.Errorf("pod name is required")
	}
	if strings.TrimSpace(s.client.ConfigPath) == "" {
		return ResourceTextResult{}, fmt.Errorf("kubeconfig path is required for describe")
	}
	if strings.TrimSpace(s.client.AccessToken) == "" {
		return ResourceTextResult{}, fmt.Errorf("access token is required for describe")
	}

	if _, err := s.client.Kubernetes.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{}); err != nil {
		return ResourceTextResult{}, fmt.Errorf("get pod %s/%s: %w", namespace, name, err)
	}

	args := []string{
		"--kubeconfig", s.client.ConfigPath,
		"--token", s.client.AccessToken,
		"describe",
		"pod",
		"-n", namespace,
		name,
	}

	output, err := exec.CommandContext(ctx, "kubectl", args...).CombinedOutput()
	if err != nil {
		return ResourceTextResult{}, fmt.Errorf("describe pod %s/%s: %w", namespace, name, err)
	}

	return ResourceTextResult{
		Namespace:   namespace,
		Name:        name,
		Content:     string(output),
		GeneratedAt: time.Now().Format("2006-01-02 15:04:05"),
	}, nil
}

func (s *ClusterService) UpdatePodYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(ctx, "pod", "Pod", namespace, name, content)
}

func (s *ClusterService) GetDeploymentYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "deployment", "Deployment", namespace, name)
}

func (s *ClusterService) UpdateDeploymentYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(ctx, "deployment", "Deployment", namespace, name, content)
}

func (s *ClusterService) GetStatefulSetYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "statefulset", "StatefulSet", namespace, name)
}

func (s *ClusterService) UpdateStatefulSetYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(ctx, "statefulset", "StatefulSet", namespace, name, content)
}

func (s *ClusterService) GetReplicaSetYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "replicaset", "ReplicaSet", namespace, name)
}

func (s *ClusterService) UpdateReplicaSetYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(ctx, "replicaset", "ReplicaSet", namespace, name, content)
}

func (s *ClusterService) GetDaemonSetYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "daemonset", "DaemonSet", namespace, name)
}

func (s *ClusterService) UpdateDaemonSetYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(ctx, "daemonset", "DaemonSet", namespace, name, content)
}

func (s *ClusterService) GetJobYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "job", "Job", namespace, name)
}

func (s *ClusterService) UpdateJobYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(ctx, "job", "Job", namespace, name, content)
}

func (s *ClusterService) GetCronJobYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "cronjob", "CronJob", namespace, name)
}

func (s *ClusterService) UpdateCronJobYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(ctx, "cronjob", "CronJob", namespace, name, content)
}

func (s *ClusterService) BuildPodExecCommand(
	ctx context.Context,
	namespace string,
	name string,
	container string,
	command string,
	tty bool,
) (*exec.Cmd, string, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)
	container = strings.TrimSpace(container)
	command = strings.TrimSpace(command)

	if namespace == "" {
		return nil, "", fmt.Errorf("pod namespace is required")
	}
	if name == "" {
		return nil, "", fmt.Errorf("pod name is required")
	}
	if command == "" {
		command = "/bin/sh"
	}
	if strings.TrimSpace(s.client.ConfigPath) == "" {
		return nil, "", fmt.Errorf("kubeconfig path is required for exec")
	}
	if strings.TrimSpace(s.client.AccessToken) == "" {
		return nil, "", fmt.Errorf("access token is required for exec")
	}

	pod, err := s.client.Kubernetes.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, "", fmt.Errorf("get pod %s/%s: %w", namespace, name, err)
	}

	if container == "" {
		if len(pod.Spec.Containers) == 0 {
			return nil, "", fmt.Errorf("pod %s/%s has no containers", namespace, name)
		}
		container = pod.Spec.Containers[0].Name
	}

	args := []string{
		"--kubeconfig", s.client.ConfigPath,
		"--token", s.client.AccessToken,
		"exec",
		"-i",
		"-n", namespace,
		name,
	}
	if tty {
		args = append(args, "-t")
	}
	if container != "" {
		args = append(args, "-c", container)
	}
	commandArgs := strings.Fields(command)
	if len(commandArgs) == 0 {
		commandArgs = []string{"/bin/sh"}
	}
	args = append(args, "--")
	args = append(args, commandArgs...)

	cmd := exec.CommandContext(ctx, "kubectl", args...)

	return cmd, container, nil
}

func (s *ClusterService) GetResourceYAML(
	ctx context.Context,
	resourceName string,
	kind string,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)

	if namespace == "" {
		return ResourceTextResult{}, fmt.Errorf("%s namespace is required", strings.ToLower(kind))
	}
	if name == "" {
		return ResourceTextResult{}, fmt.Errorf("%s name is required", strings.ToLower(kind))
	}

	args := []string{
		"get",
		resourceName,
		"-n", namespace,
		name,
		"-o", "yaml",
	}

	output, err := s.runKubectlCommand(ctx, nil, args...)
	if err != nil {
		return ResourceTextResult{}, fmt.Errorf("get %s %s/%s yaml: %w", strings.ToLower(kind), namespace, name, err)
	}

	content, err := sanitizeManifestYAML(output)
	if err != nil {
		return ResourceTextResult{}, fmt.Errorf("sanitize %s %s/%s yaml: %w", strings.ToLower(kind), namespace, name, err)
	}

	return ResourceTextResult{
		Namespace:   namespace,
		Name:        name,
		Content:     string(content),
		GeneratedAt: time.Now().Format("2006-01-02 15:04:05"),
	}, nil
}

func (s *ClusterService) GetClusterResourceYAML(
	ctx context.Context,
	resourceName string,
	kind string,
	name string,
) (ResourceTextResult, error) {
	name = strings.TrimSpace(name)

	if name == "" {
		return ResourceTextResult{}, fmt.Errorf("%s name is required", strings.ToLower(kind))
	}

	args := []string{
		"get",
		resourceName,
		name,
		"-o", "yaml",
	}

	output, err := s.runKubectlCommand(ctx, nil, args...)
	if err != nil {
		return ResourceTextResult{}, fmt.Errorf("get %s %s yaml: %w", strings.ToLower(kind), name, err)
	}

	content, err := sanitizeManifestYAML(output)
	if err != nil {
		return ResourceTextResult{}, fmt.Errorf("sanitize %s %s yaml: %w", strings.ToLower(kind), name, err)
	}

	return ResourceTextResult{
		Name:        name,
		Content:     string(content),
		GeneratedAt: time.Now().Format("2006-01-02 15:04:05"),
	}, nil
}

func (s *ClusterService) ApplyResourceYAML(
	ctx context.Context,
	resourceName string,
	kind string,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)
	content = strings.TrimSpace(content)

	if namespace == "" {
		return WorkloadActionResult{}, fmt.Errorf("%s namespace is required", strings.ToLower(kind))
	}
	if name == "" {
		return WorkloadActionResult{}, fmt.Errorf("%s name is required", strings.ToLower(kind))
	}
	if content == "" {
		return WorkloadActionResult{}, fmt.Errorf("yaml content is required")
	}

	var manifest resourceManifestIdentity
	if err := yaml.Unmarshal([]byte(content), &manifest); err != nil {
		return WorkloadActionResult{}, fmt.Errorf("parse %s yaml: %w", strings.ToLower(kind), err)
	}

	if !strings.EqualFold(strings.TrimSpace(manifest.Kind), kind) {
		return WorkloadActionResult{}, fmt.Errorf("yaml kind must be %s", kind)
	}
	if strings.TrimSpace(manifest.Metadata.Namespace) != namespace {
		return WorkloadActionResult{}, fmt.Errorf("yaml namespace must be %s", namespace)
	}
	if strings.TrimSpace(manifest.Metadata.Name) != name {
		return WorkloadActionResult{}, fmt.Errorf("yaml name must be %s", name)
	}

	if _, err := s.runKubectlCommand(ctx, bytes.NewBufferString(content), "apply", "-f", "-"); err != nil {
		return WorkloadActionResult{}, fmt.Errorf("apply %s %s/%s yaml: %w", strings.ToLower(kind), namespace, name, err)
	}

	return WorkloadActionResult{
		Kind:      kind,
		Namespace: namespace,
		Name:      name,
		Operation: "apply",
		Message:   fmt.Sprintf("%s YAML 已更新", kind),
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
	}, nil
}

func (s *ClusterService) ApplyClusterResourceYAML(
	ctx context.Context,
	resourceName string,
	kind string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	name = strings.TrimSpace(name)
	content = strings.TrimSpace(content)

	if name == "" {
		return WorkloadActionResult{}, fmt.Errorf("%s name is required", strings.ToLower(kind))
	}
	if content == "" {
		return WorkloadActionResult{}, fmt.Errorf("yaml content is required")
	}

	var manifest resourceManifestIdentity
	if err := yaml.Unmarshal([]byte(content), &manifest); err != nil {
		return WorkloadActionResult{}, fmt.Errorf("parse %s yaml: %w", strings.ToLower(kind), err)
	}

	if !strings.EqualFold(strings.TrimSpace(manifest.Kind), kind) {
		return WorkloadActionResult{}, fmt.Errorf("yaml kind must be %s", kind)
	}
	if strings.TrimSpace(manifest.Metadata.Name) != name {
		return WorkloadActionResult{}, fmt.Errorf("yaml name must be %s", name)
	}
	if strings.TrimSpace(manifest.Metadata.Namespace) != "" {
		return WorkloadActionResult{}, fmt.Errorf("%s yaml must not set metadata.namespace", strings.ToLower(kind))
	}

	if _, err := s.runKubectlCommand(ctx, bytes.NewBufferString(content), "apply", "-f", "-"); err != nil {
		return WorkloadActionResult{}, fmt.Errorf("apply %s %s yaml: %w", strings.ToLower(kind), name, err)
	}

	return WorkloadActionResult{
		Kind:      kind,
		Name:      name,
		Operation: "apply",
		Message:   fmt.Sprintf("%s YAML 已更新", kind),
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
	}, nil
}

func (s *ClusterService) runKubectlCommand(
	ctx context.Context,
	stdin *bytes.Buffer,
	args ...string,
) ([]byte, error) {
	if strings.TrimSpace(s.client.ConfigPath) == "" {
		return nil, fmt.Errorf("kubeconfig path is required")
	}
	if strings.TrimSpace(s.client.AccessToken) == "" {
		return nil, fmt.Errorf("access token is required")
	}

	baseArgs := []string{
		"--kubeconfig", s.client.ConfigPath,
		"--token", s.client.AccessToken,
	}
	commandArgs := append(baseArgs, args...)

	cmd := exec.CommandContext(ctx, "kubectl", commandArgs...)
	if stdin != nil {
		cmd.Stdin = stdin
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("%w: %s", err, strings.TrimSpace(string(output)))
	}

	return output, nil
}

func sanitizeManifestYAML(content []byte) ([]byte, error) {
	var document yamlv3.Node
	if err := yamlv3.Unmarshal(content, &document); err != nil {
		return nil, err
	}

	if len(document.Content) == 0 {
		return content, nil
	}

	root := document.Content[0]
	if root.Kind != yamlv3.MappingNode {
		return content, nil
	}

	removeMappingKey(root, "status")

	metadata := lookupMappingValue(root, "metadata")
	if metadata != nil && metadata.Kind == yamlv3.MappingNode {
		for _, key := range []string{
			"creationTimestamp",
			"deletionGracePeriodSeconds",
			"deletionTimestamp",
			"generation",
			"managedFields",
			"resourceVersion",
			"selfLink",
			"uid",
		} {
			removeMappingKey(metadata, key)
		}

		annotations := lookupMappingValue(metadata, "annotations")
		if annotations != nil && annotations.Kind == yamlv3.MappingNode {
			removeMappingKey(annotations, "kubectl.kubernetes.io/last-applied-configuration")
			if len(annotations.Content) == 0 {
				removeMappingKey(metadata, "annotations")
			}
		}
	}

	var buffer bytes.Buffer
	encoder := yamlv3.NewEncoder(&buffer)
	encoder.SetIndent(2)
	if err := encoder.Encode(&document); err != nil {
		return nil, err
	}
	if err := encoder.Close(); err != nil {
		return nil, err
	}

	return bytes.TrimSpace(buffer.Bytes()), nil
}

func lookupMappingValue(node *yamlv3.Node, key string) *yamlv3.Node {
	if node == nil || node.Kind != yamlv3.MappingNode {
		return nil
	}

	for index := 0; index+1 < len(node.Content); index += 2 {
		if node.Content[index].Value == key {
			return node.Content[index+1]
		}
	}

	return nil
}

func removeMappingKey(node *yamlv3.Node, key string) bool {
	if node == nil || node.Kind != yamlv3.MappingNode {
		return false
	}

	for index := 0; index+1 < len(node.Content); index += 2 {
		if node.Content[index].Value != key {
			continue
		}

		node.Content = append(node.Content[:index], node.Content[index+2:]...)
		return true
	}

	return false
}

func (s *ClusterService) ListDeployments(ctx context.Context, namespace string) ([]DeploymentItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list deployments: %w", err)
	}

	pods, err := s.client.Kubernetes.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list pods for deployments: %w", err)
	}

	metricsByPod := make(map[string]metricsv1beta1.PodMetrics)
	if podMetrics, err := s.client.Metrics.MetricsV1beta1().PodMetricses(namespace).List(ctx, metav1.ListOptions{}); err == nil {
		metricsByPod = podMetricsIndex(podMetrics.Items)
	}

	deployments := make([]DeploymentItem, 0, len(items.Items))
	for _, item := range items.Items {
		selector, err := metav1.LabelSelectorAsSelector(item.Spec.Selector)
		if err != nil {
			return nil, fmt.Errorf("build deployment selector for %s/%s: %w", item.Namespace, item.Name, err)
		}

		matchedPods := filterPodsBySelector(pods.Items, item.Namespace, selector)
		deploymentPods, cpuUsage, memoryUsage, metricsAvailable, restartCount := aggregateWorkloadPods(
			matchedPods,
			metricsByPod,
		)

		deployments = append(deployments, DeploymentItem{
			Name:                item.Name,
			Namespace:           item.Namespace,
			Status:              deploymentListStatus(item),
			DesiredReplicas:     desiredReplicas(item.Spec.Replicas),
			UpdatedReplicas:     item.Status.UpdatedReplicas,
			ReadyReplicas:       item.Status.ReadyReplicas,
			AvailableReplicas:   item.Status.AvailableReplicas,
			UnavailableReplicas: item.Status.UnavailableReplicas,
			PodCount:            len(matchedPods),
			RestartCount:        restartCount,
			Strategy:            string(item.Spec.Strategy.Type),
			Age:                 ageString(item.CreationTimestamp.Time),
			CreatedAt:           item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
			MetricsAvailable:    metricsAvailable,
			CPUUsage:            cpuUsage,
			MemoryUsage:         memoryUsage,
			Selector:            jsonx.Slice[string](selectorPairs(item.Spec.Selector)),
			Labels:              jsonx.Slice[string](labelPairs(item.Labels)),
			Images:              jsonx.Slice[string](deploymentImages(item.Spec.Template.Spec.Containers)),
			Conditions:          jsonx.Slice[DeploymentConditionItem](collectDeploymentConditions(item)),
			Pods:                jsonx.Slice[DeploymentPodItem](deploymentPods),
		})
	}

	sort.Slice(deployments, func(i, j int) bool {
		leftOrder := deploymentStatusOrder(deployments[i].Status)
		rightOrder := deploymentStatusOrder(deployments[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if deployments[i].Namespace != deployments[j].Namespace {
			return deployments[i].Namespace < deployments[j].Namespace
		}
		return deployments[i].Name < deployments[j].Name
	})

	return deployments, nil
}

func (s *ClusterService) ListStatefulSets(ctx context.Context, namespace string) ([]StatefulSetItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.AppsV1().StatefulSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list statefulsets: %w", err)
	}

	pods, err := s.client.Kubernetes.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list pods for statefulsets: %w", err)
	}

	metricsByPod := make(map[string]metricsv1beta1.PodMetrics)
	if podMetrics, err := s.client.Metrics.MetricsV1beta1().PodMetricses(namespace).List(ctx, metav1.ListOptions{}); err == nil {
		metricsByPod = podMetricsIndex(podMetrics.Items)
	}

	statefulSets := make([]StatefulSetItem, 0, len(items.Items))
	for _, item := range items.Items {
		selector, err := metav1.LabelSelectorAsSelector(item.Spec.Selector)
		if err != nil {
			return nil, fmt.Errorf("build statefulset selector for %s/%s: %w", item.Namespace, item.Name, err)
		}

		matchedPods := filterPodsBySelector(pods.Items, item.Namespace, selector)
		statefulSetPods, cpuUsage, memoryUsage, metricsAvailable, restartCount := aggregateWorkloadPods(
			matchedPods,
			metricsByPod,
		)

		statefulSets = append(statefulSets, StatefulSetItem{
			Name:                item.Name,
			Namespace:           item.Namespace,
			Status:              statefulSetListStatus(item),
			ServiceName:         item.Spec.ServiceName,
			PodManagementPolicy: string(item.Spec.PodManagementPolicy),
			UpdateStrategy:      string(item.Spec.UpdateStrategy.Type),
			DesiredReplicas:     desiredReplicas(item.Spec.Replicas),
			ReadyReplicas:       item.Status.ReadyReplicas,
			CurrentReplicas:     item.Status.CurrentReplicas,
			UpdatedReplicas:     item.Status.UpdatedReplicas,
			AvailableReplicas:   item.Status.AvailableReplicas,
			PodCount:            len(matchedPods),
			RestartCount:        restartCount,
			Age:                 ageString(item.CreationTimestamp.Time),
			CreatedAt:           item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
			MetricsAvailable:    metricsAvailable,
			CPUUsage:            cpuUsage,
			MemoryUsage:         memoryUsage,
			CurrentRevision:     item.Status.CurrentRevision,
			UpdateRevision:      item.Status.UpdateRevision,
			Selector:            jsonx.Slice[string](selectorPairs(item.Spec.Selector)),
			Labels:              jsonx.Slice[string](labelPairs(item.Labels)),
			Images:              jsonx.Slice[string](deploymentImages(item.Spec.Template.Spec.Containers)),
			Conditions:          jsonx.Slice[StatefulSetConditionItem](collectStatefulSetConditions(item)),
			Pods:                jsonx.Slice[StatefulSetPodItem](statefulSetPods),
		})
	}

	sort.Slice(statefulSets, func(i, j int) bool {
		leftOrder := statefulSetStatusOrder(statefulSets[i].Status)
		rightOrder := statefulSetStatusOrder(statefulSets[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if statefulSets[i].Namespace != statefulSets[j].Namespace {
			return statefulSets[i].Namespace < statefulSets[j].Namespace
		}
		return statefulSets[i].Name < statefulSets[j].Name
	})

	return statefulSets, nil
}

func (s *ClusterService) ListReplicaSets(ctx context.Context, namespace string) ([]ReplicaSetItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.AppsV1().ReplicaSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list replicasets: %w", err)
	}

	pods, err := s.client.Kubernetes.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list pods for replicasets: %w", err)
	}

	metricsByPod := make(map[string]metricsv1beta1.PodMetrics)
	if podMetrics, err := s.client.Metrics.MetricsV1beta1().PodMetricses(namespace).List(ctx, metav1.ListOptions{}); err == nil {
		metricsByPod = podMetricsIndex(podMetrics.Items)
	}

	replicaSets := make([]ReplicaSetItem, 0, len(items.Items))
	for _, item := range items.Items {
		selector, err := metav1.LabelSelectorAsSelector(item.Spec.Selector)
		if err != nil {
			return nil, fmt.Errorf("build replicaset selector for %s/%s: %w", item.Namespace, item.Name, err)
		}

		matchedPods := filterPodsBySelector(pods.Items, item.Namespace, selector)
		replicaSetPods, cpuUsage, memoryUsage, metricsAvailable, restartCount := aggregateWorkloadPods(
			matchedPods,
			metricsByPod,
		)
		ownerKind, ownerName := controllerOwner(item.OwnerReferences)

		replicaSets = append(replicaSets, ReplicaSetItem{
			Name:              item.Name,
			Namespace:         item.Namespace,
			Status:            replicaSetListStatus(item),
			DesiredReplicas:   desiredReplicas(item.Spec.Replicas),
			CurrentReplicas:   item.Status.Replicas,
			ReadyReplicas:     item.Status.ReadyReplicas,
			AvailableReplicas: item.Status.AvailableReplicas,
			FullyLabeled:      item.Status.FullyLabeledReplicas,
			PodCount:          len(matchedPods),
			RestartCount:      restartCount,
			Age:               ageString(item.CreationTimestamp.Time),
			CreatedAt:         item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
			MetricsAvailable:  metricsAvailable,
			CPUUsage:          cpuUsage,
			MemoryUsage:       memoryUsage,
			OwnerKind:         ownerKind,
			OwnerName:         ownerName,
			Selector:          jsonx.Slice[string](selectorPairs(item.Spec.Selector)),
			Labels:            jsonx.Slice[string](labelPairs(item.Labels)),
			Images:            jsonx.Slice[string](deploymentImages(item.Spec.Template.Spec.Containers)),
			Conditions:        jsonx.Slice[ReplicaSetConditionItem](collectReplicaSetConditions(item)),
			Pods:              jsonx.Slice[ReplicaSetPodItem](replicaSetPods),
		})
	}

	sort.Slice(replicaSets, func(i, j int) bool {
		leftOrder := replicaSetStatusOrder(replicaSets[i].Status)
		rightOrder := replicaSetStatusOrder(replicaSets[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if replicaSets[i].Namespace != replicaSets[j].Namespace {
			return replicaSets[i].Namespace < replicaSets[j].Namespace
		}
		return replicaSets[i].Name < replicaSets[j].Name
	})

	return replicaSets, nil
}

func (s *ClusterService) ListDaemonSets(ctx context.Context, namespace string) ([]DaemonSetItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.AppsV1().DaemonSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list daemonsets: %w", err)
	}

	pods, err := s.client.Kubernetes.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list pods for daemonsets: %w", err)
	}

	metricsByPod := make(map[string]metricsv1beta1.PodMetrics)
	if podMetrics, err := s.client.Metrics.MetricsV1beta1().PodMetricses(namespace).List(ctx, metav1.ListOptions{}); err == nil {
		metricsByPod = podMetricsIndex(podMetrics.Items)
	}

	daemonSets := make([]DaemonSetItem, 0, len(items.Items))
	for _, item := range items.Items {
		selector, err := metav1.LabelSelectorAsSelector(item.Spec.Selector)
		if err != nil {
			return nil, fmt.Errorf("build daemonset selector for %s/%s: %w", item.Namespace, item.Name, err)
		}

		matchedPods := filterPodsBySelector(pods.Items, item.Namespace, selector)
		daemonSetPods, cpuUsage, memoryUsage, metricsAvailable, restartCount := aggregateWorkloadPods(
			matchedPods,
			metricsByPod,
		)

		daemonSets = append(daemonSets, DaemonSetItem{
			Name:                   item.Name,
			Namespace:              item.Namespace,
			Status:                 daemonSetListStatus(item),
			UpdateStrategy:         string(item.Spec.UpdateStrategy.Type),
			DesiredNumberScheduled: item.Status.DesiredNumberScheduled,
			CurrentNumberScheduled: item.Status.CurrentNumberScheduled,
			UpdatedNumberScheduled: item.Status.UpdatedNumberScheduled,
			NumberReady:            item.Status.NumberReady,
			NumberAvailable:        item.Status.NumberAvailable,
			NumberUnavailable:      item.Status.NumberUnavailable,
			NumberMisscheduled:     item.Status.NumberMisscheduled,
			PodCount:               len(matchedPods),
			RestartCount:           restartCount,
			Age:                    ageString(item.CreationTimestamp.Time),
			CreatedAt:              item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
			MetricsAvailable:       metricsAvailable,
			CPUUsage:               cpuUsage,
			MemoryUsage:            memoryUsage,
			Selector:               jsonx.Slice[string](selectorPairs(item.Spec.Selector)),
			Labels:                 jsonx.Slice[string](labelPairs(item.Labels)),
			Images:                 jsonx.Slice[string](deploymentImages(item.Spec.Template.Spec.Containers)),
			Conditions:             jsonx.Slice[DaemonSetConditionItem](collectDaemonSetConditions(item)),
			Pods:                   jsonx.Slice[DaemonSetPodItem](daemonSetPods),
		})
	}

	sort.Slice(daemonSets, func(i, j int) bool {
		leftOrder := daemonSetStatusOrder(daemonSets[i].Status)
		rightOrder := daemonSetStatusOrder(daemonSets[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if daemonSets[i].Namespace != daemonSets[j].Namespace {
			return daemonSets[i].Namespace < daemonSets[j].Namespace
		}
		return daemonSets[i].Name < daemonSets[j].Name
	})

	return daemonSets, nil
}

func (s *ClusterService) ListJobs(ctx context.Context, namespace string) ([]JobItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.BatchV1().Jobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list jobs: %w", err)
	}

	pods, err := s.client.Kubernetes.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list pods for jobs: %w", err)
	}

	metricsByPod := make(map[string]metricsv1beta1.PodMetrics)
	if podMetrics, err := s.client.Metrics.MetricsV1beta1().PodMetricses(namespace).List(ctx, metav1.ListOptions{}); err == nil {
		metricsByPod = podMetricsIndex(podMetrics.Items)
	}

	podsByJob := podsByController(pods.Items, "Job")
	jobs := make([]JobItem, 0, len(items.Items))
	for _, item := range items.Items {
		matchedPods := podsByJob[namespacedName(item.Namespace, item.Name)]
		jobPods, cpuUsage, memoryUsage, metricsAvailable, restartCount := aggregateWorkloadPods(
			matchedPods,
			metricsByPod,
		)
		ownerKind, ownerName := controllerOwner(item.OwnerReferences)

		jobs = append(jobs, JobItem{
			Name:               item.Name,
			Namespace:          item.Namespace,
			Status:             jobListStatus(item),
			Parallelism:        desiredReplicas(item.Spec.Parallelism),
			DesiredCompletions: desiredReplicas(item.Spec.Completions),
			Active:             item.Status.Active,
			Succeeded:          item.Status.Succeeded,
			Failed:             item.Status.Failed,
			CompletionMode:     jobCompletionMode(item.Spec.CompletionMode),
			PodCount:           len(matchedPods),
			RestartCount:       restartCount,
			Age:                ageString(item.CreationTimestamp.Time),
			CreatedAt:          item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
			MetricsAvailable:   metricsAvailable,
			CPUUsage:           cpuUsage,
			MemoryUsage:        memoryUsage,
			StartTime:          timeString(item.Status.StartTime),
			CompletionTime:     timeString(item.Status.CompletionTime),
			OwnerKind:          ownerKind,
			OwnerName:          ownerName,
			Labels:             jsonx.Slice[string](labelPairs(item.Labels)),
			Images:             jsonx.Slice[string](deploymentImages(item.Spec.Template.Spec.Containers)),
			Conditions:         jsonx.Slice[JobConditionItem](collectJobConditions(item)),
			Pods:               jsonx.Slice[JobPodItem](jobPods),
		})
	}

	sort.Slice(jobs, func(i, j int) bool {
		leftOrder := jobStatusOrder(jobs[i].Status)
		rightOrder := jobStatusOrder(jobs[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if jobs[i].Namespace != jobs[j].Namespace {
			return jobs[i].Namespace < jobs[j].Namespace
		}
		return jobs[i].Name < jobs[j].Name
	})

	return jobs, nil
}

func (s *ClusterService) ListCronJobs(ctx context.Context, namespace string) ([]CronJobItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.BatchV1().CronJobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list cronjobs: %w", err)
	}

	jobs, err := s.client.Kubernetes.BatchV1().Jobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list jobs for cronjobs: %w", err)
	}

	pods, err := s.client.Kubernetes.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list pods for cronjobs: %w", err)
	}

	metricsByPod := make(map[string]metricsv1beta1.PodMetrics)
	if podMetrics, err := s.client.Metrics.MetricsV1beta1().PodMetricses(namespace).List(ctx, metav1.ListOptions{}); err == nil {
		metricsByPod = podMetricsIndex(podMetrics.Items)
	}

	jobsByCronJob := jobsByController(jobs.Items, "CronJob")
	podsByJob := podsByController(pods.Items, "Job")
	cronJobs := make([]CronJobItem, 0, len(items.Items))
	for _, item := range items.Items {
		childJobs := jobsByCronJob[namespacedName(item.Namespace, item.Name)]
		cronJobJobs := make([]CronJobJobItem, 0, len(childJobs))
		allPods := make([]corev1.Pod, 0)

		for _, job := range childJobs {
			matchedPods := podsByJob[namespacedName(job.Namespace, job.Name)]
			allPods = append(allPods, matchedPods...)

			_, cpuUsage, memoryUsage, metricsAvailable, _ := aggregateWorkloadPods(
				matchedPods,
				metricsByPod,
			)

			cronJobJobs = append(cronJobJobs, CronJobJobItem{
				Name:             job.Name,
				Status:           jobListStatus(job),
				Active:           job.Status.Active,
				Succeeded:        job.Status.Succeeded,
				Failed:           job.Status.Failed,
				StartTime:        timeString(job.Status.StartTime),
				CompletionTime:   timeString(job.Status.CompletionTime),
				MetricsAvailable: metricsAvailable,
				CPUUsage:         cpuUsage,
				MemoryUsage:      memoryUsage,
			})
		}

		sort.Slice(cronJobJobs, func(i, j int) bool {
			leftOrder := jobStatusOrder(cronJobJobs[i].Status)
			rightOrder := jobStatusOrder(cronJobJobs[j].Status)
			if leftOrder != rightOrder {
				return leftOrder < rightOrder
			}
			return cronJobJobs[i].Name > cronJobJobs[j].Name
		})

		_, cpuUsage, memoryUsage, metricsAvailable, restartCount := aggregateWorkloadPods(
			allPods,
			metricsByPod,
		)

		cronJobs = append(cronJobs, CronJobItem{
			Name:                  item.Name,
			Namespace:             item.Namespace,
			Status:                cronJobListStatus(item, childJobs),
			Schedule:              item.Spec.Schedule,
			TimeZone:              cronJobTimeZone(item),
			Suspend:               item.Spec.Suspend != nil && *item.Spec.Suspend,
			ConcurrencyPolicy:     string(item.Spec.ConcurrencyPolicy),
			ActiveJobs:            len(item.Status.Active),
			JobCount:              len(childJobs),
			PodCount:              len(allPods),
			RestartCount:          restartCount,
			SuccessfulJobsHistory: optionalInt32(item.Spec.SuccessfulJobsHistoryLimit),
			FailedJobsHistory:     optionalInt32(item.Spec.FailedJobsHistoryLimit),
			Age:                   ageString(item.CreationTimestamp.Time),
			CreatedAt:             item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
			MetricsAvailable:      metricsAvailable,
			CPUUsage:              cpuUsage,
			MemoryUsage:           memoryUsage,
			LastScheduleTime:      timeString(item.Status.LastScheduleTime),
			LastSuccessfulTime:    timeString(item.Status.LastSuccessfulTime),
			Labels:                jsonx.Slice[string](labelPairs(item.Labels)),
			Images:                jsonx.Slice[string](deploymentImages(item.Spec.JobTemplate.Spec.Template.Spec.Containers)),
			Jobs:                  jsonx.Slice[CronJobJobItem](cronJobJobs),
		})
	}

	sort.Slice(cronJobs, func(i, j int) bool {
		leftOrder := cronJobStatusOrder(cronJobs[i].Status)
		rightOrder := cronJobStatusOrder(cronJobs[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if cronJobs[i].Namespace != cronJobs[j].Namespace {
			return cronJobs[i].Namespace < cronJobs[j].Namespace
		}
		return cronJobs[i].Name < cronJobs[j].Name
	})

	return cronJobs, nil
}

func (s *ClusterService) ListServices(ctx context.Context, namespace string) ([]ServiceItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list services: %w", err)
	}

	pods, err := s.client.Kubernetes.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list pods for services: %w", err)
	}

	services := make([]ServiceItem, 0, len(items.Items))
	for _, item := range items.Items {
		selector := labels.SelectorFromSet(item.Spec.Selector)
		matchedPods := filterPodsBySelector(pods.Items, item.Namespace, selector)

		services = append(services, ServiceItem{
			Name:              item.Name,
			Namespace:         item.Namespace,
			Status:            serviceStatus(item, len(matchedPods), 0),
			Type:              string(item.Spec.Type),
			Summary:           serviceSummary(item),
			ClusterIP:         serviceClusterIP(item),
			ExternalName:      item.Spec.ExternalName,
			ExternalAddresses: jsonx.Slice[string](serviceExternalAddresses(item)),
			SessionAffinity:   string(item.Spec.SessionAffinity),
			PortsSummary:      servicePorts(item),
			PodCount:          len(matchedPods),
			Selector:          jsonx.Slice[string](labelPairs(item.Spec.Selector)),
			Ports:             jsonx.Slice[ServicePortItem](servicePortItems(item)),
			Labels:            jsonx.Slice[string](labelPairs(item.Labels)),
			Age:               ageString(item.CreationTimestamp.Time),
			CreatedAt:         item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(services, func(i, j int) bool {
		leftOrder := topologyStatusOrder(services[i].Status)
		rightOrder := topologyStatusOrder(services[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if services[i].Namespace != services[j].Namespace {
			return services[i].Namespace < services[j].Namespace
		}
		return services[i].Name < services[j].Name
	})

	return services, nil
}

func (s *ClusterService) ListIngresses(ctx context.Context, namespace string) ([]IngressItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.NetworkingV1().Ingresses(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list ingresses: %w", err)
	}

	ingresses := make([]IngressItem, 0, len(items.Items))
	for _, item := range items.Items {
		ingresses = append(ingresses, IngressItem{
			Name:           item.Name,
			Namespace:      item.Namespace,
			Status:         ingressStatus(item, 0),
			IngressClass:   defaultString(ptrString(item.Spec.IngressClassName), "-"),
			Summary:        ingressSummary(item),
			Hosts:          jsonx.Slice[string](ingressHosts(item)),
			Addresses:      jsonx.Slice[string](ingressAddresses(item)),
			ServiceNames:   jsonx.Slice[string](ingressServiceNames(item)),
			DefaultBackend: ingressDefaultBackend(item),
			BackendCount:   ingressBackendCount(item),
			TLS:            jsonx.Slice[IngressTLSItem](collectIngressTLS(item)),
			Labels:         jsonx.Slice[string](labelPairs(item.Labels)),
			Age:            ageString(item.CreationTimestamp.Time),
			CreatedAt:      item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(ingresses, func(i, j int) bool {
		leftOrder := topologyStatusOrder(ingresses[i].Status)
		rightOrder := topologyStatusOrder(ingresses[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if ingresses[i].Namespace != ingresses[j].Namespace {
			return ingresses[i].Namespace < ingresses[j].Namespace
		}
		return ingresses[i].Name < ingresses[j].Name
	})

	return ingresses, nil
}

func (s *ClusterService) ListPersistentVolumeClaims(
	ctx context.Context,
	namespace string,
) ([]PersistentVolumeClaimItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.CoreV1().PersistentVolumeClaims(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list persistentvolumeclaims: %w", err)
	}

	pods, err := s.client.Kubernetes.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list pods for persistentvolumeclaims: %w", err)
	}

	podsByClaim := podsByPersistentVolumeClaim(pods.Items)
	claims := make([]PersistentVolumeClaimItem, 0, len(items.Items))
	for _, item := range items.Items {
		relatedPods := podsByClaim[namespacedName(item.Namespace, item.Name)]
		claims = append(claims, PersistentVolumeClaimItem{
			Name:             item.Name,
			Namespace:        item.Namespace,
			Status:           pvcStatus(item, 0),
			Summary:          pvcSummary(item),
			StorageClass:     pvcStorageClass(item),
			VolumeName:       item.Spec.VolumeName,
			VolumeMode:       pvcVolumeMode(item),
			AccessModes:      jsonx.Slice[string](pvcAccessModes(item.Spec.AccessModes)),
			RequestedStorage: pvcRequestedStorage(item),
			Capacity:         pvcCapacity(item),
			MountedPodCount:  len(relatedPods),
			MountedPods:      jsonx.Slice[string](relatedPods),
			Labels:           jsonx.Slice[string](labelPairs(item.Labels)),
			Age:              ageString(item.CreationTimestamp.Time),
			CreatedAt:        item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(claims, func(i, j int) bool {
		leftOrder := topologyStatusOrder(claims[i].Status)
		rightOrder := topologyStatusOrder(claims[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if claims[i].Namespace != claims[j].Namespace {
			return claims[i].Namespace < claims[j].Namespace
		}
		return claims[i].Name < claims[j].Name
	})

	return claims, nil
}

func (s *ClusterService) ListIngressClasses(ctx context.Context) ([]IngressClassItem, error) {
	items, err := s.client.Kubernetes.NetworkingV1().IngressClasses().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list ingressclasses: %w", err)
	}

	classes := make([]IngressClassItem, 0, len(items.Items))
	for _, item := range items.Items {
		classes = append(classes, IngressClassItem{
			Name:       item.Name,
			Status:     ingressClassStatus(item),
			Controller: item.Spec.Controller,
			IsDefault:  isDefaultIngressClass(item),
			Parameters: ingressClassParameters(item),
			Labels:     jsonx.Slice[string](labelPairs(item.Labels)),
			Age:        ageString(item.CreationTimestamp.Time),
			CreatedAt:  item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(classes, func(i, j int) bool {
		if classes[i].IsDefault != classes[j].IsDefault {
			return classes[i].IsDefault
		}
		if classes[i].Status != classes[j].Status {
			return topologyStatusOrder(classes[i].Status) < topologyStatusOrder(classes[j].Status)
		}
		return classes[i].Name < classes[j].Name
	})

	return classes, nil
}

func (s *ClusterService) ListNetworkPolicies(
	ctx context.Context,
	namespace string,
) ([]NetworkPolicyItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.NetworkingV1().NetworkPolicies(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list networkpolicies: %w", err)
	}

	pods, err := s.client.Kubernetes.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list pods for networkpolicies: %w", err)
	}

	policies := make([]NetworkPolicyItem, 0, len(items.Items))
	for _, item := range items.Items {
		selectedPods := networkPolicySelectedPods(item, pods.Items)
		policies = append(policies, NetworkPolicyItem{
			Name:             item.Name,
			Namespace:        item.Namespace,
			Status:           networkPolicyStatus(item, len(selectedPods)),
			Summary:          networkPolicySummary(item, len(selectedPods)),
			PodSelector:      jsonx.Slice[string](selectorPairs(&item.Spec.PodSelector)),
			PolicyTypes:      jsonx.Slice[string](networkPolicyTypes(item)),
			SelectedPodCount: len(selectedPods),
			SelectedPods:     jsonx.Slice[string](selectedPods),
			IngressRuleCount: len(item.Spec.Ingress),
			EgressRuleCount:  len(item.Spec.Egress),
			IngressRules:     jsonx.Slice[NetworkPolicyRuleItem](networkPolicyIngressRules(item)),
			EgressRules:      jsonx.Slice[NetworkPolicyRuleItem](networkPolicyEgressRules(item)),
			Labels:           jsonx.Slice[string](labelPairs(item.Labels)),
			Age:              ageString(item.CreationTimestamp.Time),
			CreatedAt:        item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(policies, func(i, j int) bool {
		leftOrder := topologyStatusOrder(policies[i].Status)
		rightOrder := topologyStatusOrder(policies[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if policies[i].Namespace != policies[j].Namespace {
			return policies[i].Namespace < policies[j].Namespace
		}
		return policies[i].Name < policies[j].Name
	})

	return policies, nil
}

func (s *ClusterService) GetServiceYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "service", "Service", namespace, name)
}

func (s *ClusterService) UpdateServiceYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(ctx, "service", "Service", namespace, name, content)
}

func (s *ClusterService) GetIngressYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "ingress", "Ingress", namespace, name)
}

func (s *ClusterService) UpdateIngressYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(ctx, "ingress", "Ingress", namespace, name, content)
}

func (s *ClusterService) GetIngressClassYAML(
	ctx context.Context,
	name string,
) (ResourceTextResult, error) {
	return s.GetClusterResourceYAML(ctx, "ingressclass", "IngressClass", name)
}

func (s *ClusterService) UpdateIngressClassYAML(
	ctx context.Context,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyClusterResourceYAML(ctx, "ingressclass", "IngressClass", name, content)
}

func (s *ClusterService) GetNetworkPolicyYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "networkpolicy", "NetworkPolicy", namespace, name)
}

func (s *ClusterService) UpdateNetworkPolicyYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(ctx, "networkpolicy", "NetworkPolicy", namespace, name, content)
}

func (s *ClusterService) GetPersistentVolumeClaimYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "persistentvolumeclaim", "PersistentVolumeClaim", namespace, name)
}

func (s *ClusterService) UpdatePersistentVolumeClaimYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(
		ctx,
		"persistentvolumeclaim",
		"PersistentVolumeClaim",
		namespace,
		name,
		content,
	)
}

func (s *ClusterService) ListEndpoints(ctx context.Context, namespace string) ([]EndpointItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.CoreV1().Endpoints(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list endpoints: %w", err)
	}

	services, err := s.client.Kubernetes.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list services for endpoints: %w", err)
	}

	serviceNames := make(map[string]struct{}, len(services.Items))
	for _, item := range services.Items {
		serviceNames[namespacedName(item.Namespace, item.Name)] = struct{}{}
	}

	endpoints := make([]EndpointItem, 0, len(items.Items))
	for _, item := range items.Items {
		addresses, readyCount, notReadyCount := collectEndpointAddresses(item)
		serviceName := ""
		if _, ok := serviceNames[namespacedName(item.Namespace, item.Name)]; ok {
			serviceName = item.Name
		}

		endpoints = append(endpoints, EndpointItem{
			Name:              item.Name,
			Namespace:         item.Namespace,
			Status:            endpointStatus(item),
			ServiceName:       serviceName,
			Subsets:           len(item.Subsets),
			ReadyAddresses:    readyCount,
			NotReadyAddresses: notReadyCount,
			PortsSummary:      endpointPorts(item),
			Addresses:         jsonx.Slice[EndpointAddressItem](addresses),
			Labels:            jsonx.Slice[string](labelPairs(item.Labels)),
			Age:               ageString(item.CreationTimestamp.Time),
			CreatedAt:         item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(endpoints, func(i, j int) bool {
		leftOrder := topologyStatusOrder(endpoints[i].Status)
		rightOrder := topologyStatusOrder(endpoints[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if endpoints[i].Namespace != endpoints[j].Namespace {
			return endpoints[i].Namespace < endpoints[j].Namespace
		}
		return endpoints[i].Name < endpoints[j].Name
	})

	return endpoints, nil
}

func (s *ClusterService) ListPersistentVolumes(ctx context.Context) ([]PersistentVolumeItem, error) {
	items, err := s.client.Kubernetes.CoreV1().PersistentVolumes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list persistentvolumes: %w", err)
	}

	volumes := make([]PersistentVolumeItem, 0, len(items.Items))
	for _, item := range items.Items {
		claimNamespace := ""
		claimName := ""
		if item.Spec.ClaimRef != nil {
			claimNamespace = item.Spec.ClaimRef.Namespace
			claimName = item.Spec.ClaimRef.Name
		}

		volumes = append(volumes, PersistentVolumeItem{
			Name:           item.Name,
			Status:         persistentVolumeStatus(item),
			Phase:          string(item.Status.Phase),
			Capacity:       persistentVolumeCapacity(item),
			AccessModes:    jsonx.Slice[string](pvcAccessModes(item.Spec.AccessModes)),
			ReclaimPolicy:  string(item.Spec.PersistentVolumeReclaimPolicy),
			StorageClass:   item.Spec.StorageClassName,
			VolumeMode:     persistentVolumeVolumeMode(item),
			ClaimNamespace: claimNamespace,
			ClaimName:      claimName,
			Source:         persistentVolumeSource(item),
			Labels:         jsonx.Slice[string](labelPairs(item.Labels)),
			Age:            ageString(item.CreationTimestamp.Time),
			CreatedAt:      item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(volumes, func(i, j int) bool {
		leftOrder := topologyStatusOrder(volumes[i].Status)
		rightOrder := topologyStatusOrder(volumes[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		return volumes[i].Name < volumes[j].Name
	})

	return volumes, nil
}

func (s *ClusterService) ListStorageClasses(ctx context.Context) ([]StorageClassItem, error) {
	items, err := s.client.Kubernetes.StorageV1().StorageClasses().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list storageclasses: %w", err)
	}

	classes := make([]StorageClassItem, 0, len(items.Items))
	for _, item := range items.Items {
		classes = append(classes, StorageClassItem{
			Name:                 item.Name,
			Status:               TopologyStatusHealthy,
			Provisioner:          item.Provisioner,
			ReclaimPolicy:        storageClassReclaimPolicy(item),
			VolumeBindingMode:    storageClassVolumeBindingMode(item),
			AllowVolumeExpansion: item.AllowVolumeExpansion != nil && *item.AllowVolumeExpansion,
			IsDefault:            isDefaultStorageClass(item),
			Parameters:           jsonx.Slice[string](storageClassParameters(item.Parameters)),
			Labels:               jsonx.Slice[string](labelPairs(item.Labels)),
			Age:                  ageString(item.CreationTimestamp.Time),
			CreatedAt:            item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(classes, func(i, j int) bool {
		if classes[i].IsDefault != classes[j].IsDefault {
			return classes[i].IsDefault
		}
		return classes[i].Name < classes[j].Name
	})

	return classes, nil
}

func (s *ClusterService) GetEndpointYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "endpoints", "Endpoints", namespace, name)
}

func (s *ClusterService) UpdateEndpointYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(ctx, "endpoints", "Endpoints", namespace, name, content)
}

func (s *ClusterService) GetPersistentVolumeYAML(
	ctx context.Context,
	name string,
) (ResourceTextResult, error) {
	return s.GetClusterResourceYAML(ctx, "persistentvolume", "PersistentVolume", name)
}

func (s *ClusterService) UpdatePersistentVolumeYAML(
	ctx context.Context,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyClusterResourceYAML(ctx, "persistentvolume", "PersistentVolume", name, content)
}

func (s *ClusterService) GetStorageClassYAML(
	ctx context.Context,
	name string,
) (ResourceTextResult, error) {
	return s.GetClusterResourceYAML(ctx, "storageclass", "StorageClass", name)
}

func (s *ClusterService) UpdateStorageClassYAML(
	ctx context.Context,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyClusterResourceYAML(ctx, "storageclass", "StorageClass", name, content)
}

func (s *ClusterService) ScaleReplicaSet(
	ctx context.Context,
	namespace string,
	name string,
	replicas int32,
) (WorkloadActionResult, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)

	if namespace == "" {
		return WorkloadActionResult{}, fmt.Errorf("replicaset namespace is required")
	}
	if name == "" {
		return WorkloadActionResult{}, fmt.Errorf("replicaset name is required")
	}
	if replicas < 0 {
		return WorkloadActionResult{}, fmt.Errorf("replicaset replicas must be >= 0")
	}

	if err := utilretry.RetryOnConflict(utilretry.DefaultRetry, func() error {
		item, err := s.client.Kubernetes.AppsV1().ReplicaSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return fmt.Errorf("get replicaset %s/%s: %w", namespace, name, err)
		}

		item.Spec.Replicas = &replicas
		if _, err := s.client.Kubernetes.AppsV1().ReplicaSets(namespace).Update(ctx, item, metav1.UpdateOptions{}); err != nil {
			return err
		}

		return nil
	}); err != nil {
		return WorkloadActionResult{}, fmt.Errorf("update replicaset replicas for %s/%s: %w", namespace, name, err)
	}

	return WorkloadActionResult{
		Kind:      "ReplicaSet",
		Namespace: namespace,
		Name:      name,
		Operation: "scale",
		Message:   fmt.Sprintf("ReplicaSet 已调整为 %d 个副本", replicas),
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
	}, nil
}

func (s *ClusterService) SetJobSuspend(
	ctx context.Context,
	namespace string,
	name string,
	suspend bool,
) (WorkloadActionResult, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)

	if namespace == "" {
		return WorkloadActionResult{}, fmt.Errorf("job namespace is required")
	}
	if name == "" {
		return WorkloadActionResult{}, fmt.Errorf("job name is required")
	}

	if err := utilretry.RetryOnConflict(utilretry.DefaultRetry, func() error {
		item, err := s.client.Kubernetes.BatchV1().Jobs(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return fmt.Errorf("get job %s/%s: %w", namespace, name, err)
		}

		item.Spec.Suspend = &suspend
		if _, err := s.client.Kubernetes.BatchV1().Jobs(namespace).Update(ctx, item, metav1.UpdateOptions{}); err != nil {
			return err
		}

		return nil
	}); err != nil {
		return WorkloadActionResult{}, fmt.Errorf("update job suspend state for %s/%s: %w", namespace, name, err)
	}

	operation := "resume"
	message := "Job 已恢复调度"
	if suspend {
		operation = "suspend"
		message = "Job 已暂停"
	}

	return WorkloadActionResult{
		Kind:      "Job",
		Namespace: namespace,
		Name:      name,
		Operation: operation,
		Message:   message,
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
	}, nil
}

func (s *ClusterService) SetCronJobSuspend(
	ctx context.Context,
	namespace string,
	name string,
	suspend bool,
) (WorkloadActionResult, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)

	if namespace == "" {
		return WorkloadActionResult{}, fmt.Errorf("cronjob namespace is required")
	}
	if name == "" {
		return WorkloadActionResult{}, fmt.Errorf("cronjob name is required")
	}

	if err := utilretry.RetryOnConflict(utilretry.DefaultRetry, func() error {
		item, err := s.client.Kubernetes.BatchV1().CronJobs(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return fmt.Errorf("get cronjob %s/%s: %w", namespace, name, err)
		}

		item.Spec.Suspend = &suspend
		if _, err := s.client.Kubernetes.BatchV1().CronJobs(namespace).Update(ctx, item, metav1.UpdateOptions{}); err != nil {
			return err
		}

		return nil
	}); err != nil {
		return WorkloadActionResult{}, fmt.Errorf("update cronjob suspend state for %s/%s: %w", namespace, name, err)
	}

	operation := "resume"
	message := "CronJob 已恢复调度"
	if suspend {
		operation = "suspend"
		message = "CronJob 已暂停"
	}

	return WorkloadActionResult{
		Kind:      "CronJob",
		Namespace: namespace,
		Name:      name,
		Operation: operation,
		Message:   message,
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
	}, nil
}

func (s *ClusterService) ScaleDeployment(
	ctx context.Context,
	namespace string,
	name string,
	replicas int32,
) (WorkloadActionResult, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)

	if namespace == "" {
		return WorkloadActionResult{}, fmt.Errorf("deployment namespace is required")
	}
	if name == "" {
		return WorkloadActionResult{}, fmt.Errorf("deployment name is required")
	}
	if replicas < 0 {
		return WorkloadActionResult{}, fmt.Errorf("deployment replicas must be >= 0")
	}

	if err := utilretry.RetryOnConflict(utilretry.DefaultRetry, func() error {
		item, err := s.client.Kubernetes.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return fmt.Errorf("get deployment %s/%s: %w", namespace, name, err)
		}

		item.Spec.Replicas = &replicas
		if _, err := s.client.Kubernetes.AppsV1().Deployments(namespace).Update(ctx, item, metav1.UpdateOptions{}); err != nil {
			return err
		}

		return nil
	}); err != nil {
		return WorkloadActionResult{}, fmt.Errorf("update deployment replicas for %s/%s: %w", namespace, name, err)
	}

	return WorkloadActionResult{
		Kind:      "Deployment",
		Namespace: namespace,
		Name:      name,
		Operation: "scale",
		Message:   fmt.Sprintf("Deployment 已调整为 %d 个副本", replicas),
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
	}, nil
}

func (s *ClusterService) RestartDeployment(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)

	if namespace == "" {
		return WorkloadActionResult{}, fmt.Errorf("deployment namespace is required")
	}
	if name == "" {
		return WorkloadActionResult{}, fmt.Errorf("deployment name is required")
	}

	restartedAt := time.Now().Format(time.RFC3339)
	body, err := json.Marshal(map[string]any{
		"spec": map[string]any{
			"template": map[string]any{
				"metadata": map[string]any{
					"annotations": map[string]string{
						"kubectl.kubernetes.io/restartedAt": restartedAt,
					},
				},
			},
		},
	})
	if err != nil {
		return WorkloadActionResult{}, fmt.Errorf("marshal deployment restart patch for %s/%s: %w", namespace, name, err)
	}

	if _, err := s.client.Kubernetes.AppsV1().Deployments(namespace).Patch(
		ctx,
		name,
		types.StrategicMergePatchType,
		body,
		metav1.PatchOptions{},
	); err != nil {
		return WorkloadActionResult{}, fmt.Errorf("restart deployment %s/%s: %w", namespace, name, err)
	}

	return WorkloadActionResult{
		Kind:      "Deployment",
		Namespace: namespace,
		Name:      name,
		Operation: "restart",
		Message:   "Deployment 滚动重启已触发",
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
	}, nil
}

func (s *ClusterService) ScaleStatefulSet(
	ctx context.Context,
	namespace string,
	name string,
	replicas int32,
) (WorkloadActionResult, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)

	if namespace == "" {
		return WorkloadActionResult{}, fmt.Errorf("statefulset namespace is required")
	}
	if name == "" {
		return WorkloadActionResult{}, fmt.Errorf("statefulset name is required")
	}
	if replicas < 0 {
		return WorkloadActionResult{}, fmt.Errorf("statefulset replicas must be >= 0")
	}

	if err := utilretry.RetryOnConflict(utilretry.DefaultRetry, func() error {
		item, err := s.client.Kubernetes.AppsV1().StatefulSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if err != nil {
			return fmt.Errorf("get statefulset %s/%s: %w", namespace, name, err)
		}

		item.Spec.Replicas = &replicas
		if _, err := s.client.Kubernetes.AppsV1().StatefulSets(namespace).Update(ctx, item, metav1.UpdateOptions{}); err != nil {
			return err
		}

		return nil
	}); err != nil {
		return WorkloadActionResult{}, fmt.Errorf("update statefulset replicas for %s/%s: %w", namespace, name, err)
	}

	return WorkloadActionResult{
		Kind:      "StatefulSet",
		Namespace: namespace,
		Name:      name,
		Operation: "scale",
		Message:   fmt.Sprintf("StatefulSet 已调整为 %d 个副本", replicas),
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
	}, nil
}

func (s *ClusterService) RestartStatefulSet(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)

	if namespace == "" {
		return WorkloadActionResult{}, fmt.Errorf("statefulset namespace is required")
	}
	if name == "" {
		return WorkloadActionResult{}, fmt.Errorf("statefulset name is required")
	}

	restartedAt := time.Now().Format(time.RFC3339)
	body, err := json.Marshal(map[string]any{
		"spec": map[string]any{
			"template": map[string]any{
				"metadata": map[string]any{
					"annotations": map[string]string{
						"kubectl.kubernetes.io/restartedAt": restartedAt,
					},
				},
			},
		},
	})
	if err != nil {
		return WorkloadActionResult{}, fmt.Errorf("marshal statefulset restart patch for %s/%s: %w", namespace, name, err)
	}

	if _, err := s.client.Kubernetes.AppsV1().StatefulSets(namespace).Patch(
		ctx,
		name,
		types.StrategicMergePatchType,
		body,
		metav1.PatchOptions{},
	); err != nil {
		return WorkloadActionResult{}, fmt.Errorf("restart statefulset %s/%s: %w", namespace, name, err)
	}

	return WorkloadActionResult{
		Kind:      "StatefulSet",
		Namespace: namespace,
		Name:      name,
		Operation: "restart",
		Message:   "StatefulSet 滚动重启已触发",
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
	}, nil
}

func (s *ClusterService) RestartDaemonSet(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)

	if namespace == "" {
		return WorkloadActionResult{}, fmt.Errorf("daemonset namespace is required")
	}
	if name == "" {
		return WorkloadActionResult{}, fmt.Errorf("daemonset name is required")
	}

	restartedAt := time.Now().Format(time.RFC3339)
	body, err := json.Marshal(map[string]any{
		"spec": map[string]any{
			"template": map[string]any{
				"metadata": map[string]any{
					"annotations": map[string]string{
						"kubectl.kubernetes.io/restartedAt": restartedAt,
					},
				},
			},
		},
	})
	if err != nil {
		return WorkloadActionResult{}, fmt.Errorf("marshal daemonset restart patch for %s/%s: %w", namespace, name, err)
	}

	if _, err := s.client.Kubernetes.AppsV1().DaemonSets(namespace).Patch(
		ctx,
		name,
		types.StrategicMergePatchType,
		body,
		metav1.PatchOptions{},
	); err != nil {
		return WorkloadActionResult{}, fmt.Errorf("restart daemonset %s/%s: %w", namespace, name, err)
	}

	return WorkloadActionResult{
		Kind:      "DaemonSet",
		Namespace: namespace,
		Name:      name,
		Operation: "restart",
		Message:   "DaemonSet 滚动重启已触发",
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
	}, nil
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

func percentageValue(usage int64, capacity int64) float64 {
	if capacity == 0 {
		return 0
	}

	return float64(usage) / float64(capacity) * 100
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

func namespaceStatus(namespace corev1.Namespace) string {
	if namespace.DeletionTimestamp != nil {
		return "Terminating"
	}

	switch namespace.Status.Phase {
	case corev1.NamespaceTerminating:
		return "Terminating"
	case corev1.NamespaceActive:
		return "Active"
	default:
		return string(namespace.Status.Phase)
	}
}

func labelPairs(labels map[string]string) []string {
	if len(labels) == 0 {
		return nil
	}

	keys := make([]string, 0, len(labels))
	for key := range labels {
		keys = append(keys, key)
	}

	sort.Strings(keys)

	pairs := make([]string, 0, len(keys))
	for _, key := range keys {
		pairs = append(pairs, fmt.Sprintf("%s=%s", key, labels[key]))
	}

	return pairs
}

func nodeRoleOrder(role string) int {
	switch role {
	case "control-plane":
		return 0
	default:
		return 1
	}
}

func podOwner(pod corev1.Pod) (string, string) {
	for _, item := range pod.OwnerReferences {
		if item.Controller != nil && *item.Controller {
			return item.Kind, item.Name
		}
	}

	if len(pod.OwnerReferences) > 0 {
		return pod.OwnerReferences[0].Kind, pod.OwnerReferences[0].Name
	}

	return "", ""
}

func controllerOwner(items []metav1.OwnerReference) (string, string) {
	for _, item := range items {
		if item.Controller != nil && *item.Controller {
			return item.Kind, item.Name
		}
	}

	if len(items) > 0 {
		return items[0].Kind, items[0].Name
	}

	return "", ""
}

func namespacedName(namespace string, name string) string {
	return namespace + "/" + name
}

func podsByController(items []corev1.Pod, kind string) map[string][]corev1.Pod {
	index := make(map[string][]corev1.Pod)
	for _, item := range items {
		ownerKind, ownerName := controllerOwner(item.OwnerReferences)
		if ownerKind != kind || ownerName == "" {
			continue
		}

		key := namespacedName(item.Namespace, ownerName)
		index[key] = append(index[key], item)
	}

	return index
}

func jobsByController(items []batchv1.Job, kind string) map[string][]batchv1.Job {
	index := make(map[string][]batchv1.Job)
	for _, item := range items {
		ownerKind, ownerName := controllerOwner(item.OwnerReferences)
		if ownerKind != kind || ownerName == "" {
			continue
		}

		key := namespacedName(item.Namespace, ownerName)
		index[key] = append(index[key], item)
	}

	return index
}

func podsByPersistentVolumeClaim(items []corev1.Pod) map[string][]string {
	index := make(map[string][]string)
	for _, item := range items {
		seen := make(map[string]struct{})
		for _, volume := range item.Spec.Volumes {
			if volume.PersistentVolumeClaim == nil {
				continue
			}

			key := namespacedName(item.Namespace, volume.PersistentVolumeClaim.ClaimName)
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			index[key] = append(index[key], item.Name)
		}
	}

	for key := range index {
		sort.Strings(index[key])
	}

	return index
}

func topologyStatusOrder(status string) int {
	switch status {
	case TopologyStatusError:
		return 0
	case TopologyStatusWarning:
		return 1
	case TopologyStatusHealthy:
		return 2
	default:
		return 3
	}
}

func serviceClusterIP(item corev1.Service) string {
	if item.Spec.ClusterIP == "" {
		return "-"
	}
	if item.Spec.ClusterIP == corev1.ClusterIPNone {
		return "None"
	}
	return item.Spec.ClusterIP
}

func serviceExternalAddresses(item corev1.Service) []string {
	addresses := make([]string, 0)
	seen := make(map[string]struct{})

	add := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		if _, exists := seen[value]; exists {
			return
		}
		seen[value] = struct{}{}
		addresses = append(addresses, value)
	}

	for _, value := range item.Spec.ExternalIPs {
		add(value)
	}

	if item.Spec.Type == corev1.ServiceTypeExternalName {
		add(item.Spec.ExternalName)
	}

	for _, ingress := range item.Status.LoadBalancer.Ingress {
		add(ingress.IP)
		add(ingress.Hostname)
	}

	sort.Strings(addresses)

	return addresses
}

func servicePortItems(item corev1.Service) []ServicePortItem {
	ports := make([]ServicePortItem, 0, len(item.Spec.Ports))
	for _, port := range item.Spec.Ports {
		ports = append(ports, ServicePortItem{
			Name:       port.Name,
			Protocol:   string(port.Protocol),
			Port:       port.Port,
			TargetPort: port.TargetPort.String(),
			NodePort:   port.NodePort,
		})
	}

	return ports
}

func ingressHosts(item networkingv1.Ingress) []string {
	hosts := make([]string, 0, len(item.Spec.Rules))
	seen := make(map[string]struct{})
	for _, rule := range item.Spec.Rules {
		host := strings.TrimSpace(rule.Host)
		if host == "" {
			continue
		}
		if _, exists := seen[host]; exists {
			continue
		}
		seen[host] = struct{}{}
		hosts = append(hosts, host)
	}

	sort.Strings(hosts)

	return hosts
}

func ingressAddresses(item networkingv1.Ingress) []string {
	addresses := make([]string, 0, len(item.Status.LoadBalancer.Ingress))
	for _, ingress := range item.Status.LoadBalancer.Ingress {
		if ip := strings.TrimSpace(ingress.IP); ip != "" {
			addresses = append(addresses, ip)
		}
		if hostname := strings.TrimSpace(ingress.Hostname); hostname != "" {
			addresses = append(addresses, hostname)
		}
	}

	sort.Strings(addresses)

	return addresses
}

func ingressDefaultBackend(item networkingv1.Ingress) string {
	if item.Spec.DefaultBackend == nil || item.Spec.DefaultBackend.Service == nil {
		return ""
	}

	port := item.Spec.DefaultBackend.Service.Port
	if port.Number > 0 {
		return fmt.Sprintf("%s:%d", item.Spec.DefaultBackend.Service.Name, port.Number)
	}
	if port.Name != "" {
		return fmt.Sprintf("%s:%s", item.Spec.DefaultBackend.Service.Name, port.Name)
	}

	return item.Spec.DefaultBackend.Service.Name
}

func collectIngressTLS(item networkingv1.Ingress) []IngressTLSItem {
	tlsItems := make([]IngressTLSItem, 0, len(item.Spec.TLS))
	for _, entry := range item.Spec.TLS {
		hosts := append([]string(nil), entry.Hosts...)
		sort.Strings(hosts)
		tlsItems = append(tlsItems, IngressTLSItem{
			SecretName: entry.SecretName,
			Hosts:      jsonx.Slice[string](hosts),
		})
	}

	return tlsItems
}

func pvcStorageClass(item corev1.PersistentVolumeClaim) string {
	if item.Spec.StorageClassName == nil || strings.TrimSpace(*item.Spec.StorageClassName) == "" {
		return "-"
	}

	return *item.Spec.StorageClassName
}

func pvcVolumeMode(item corev1.PersistentVolumeClaim) string {
	if item.Spec.VolumeMode == nil || strings.TrimSpace(string(*item.Spec.VolumeMode)) == "" {
		return "Filesystem"
	}

	return string(*item.Spec.VolumeMode)
}

func pvcAccessModes(items []corev1.PersistentVolumeAccessMode) []string {
	if len(items) == 0 {
		return []string{"-"}
	}

	modes := make([]string, 0, len(items))
	for _, item := range items {
		modes = append(modes, string(item))
	}

	sort.Strings(modes)

	return modes
}

func pvcRequestedStorage(item corev1.PersistentVolumeClaim) string {
	if quantity, ok := item.Spec.Resources.Requests[corev1.ResourceStorage]; ok {
		return quantity.String()
	}

	return "-"
}

func pvcCapacity(item corev1.PersistentVolumeClaim) string {
	if quantity, ok := item.Status.Capacity[corev1.ResourceStorage]; ok {
		return quantity.String()
	}

	return ""
}

func endpointStatus(item corev1.Endpoints) string {
	readyCount := 0
	notReadyCount := 0
	for _, subset := range item.Subsets {
		readyCount += len(subset.Addresses)
		notReadyCount += len(subset.NotReadyAddresses)
	}

	switch {
	case readyCount > 0:
		if notReadyCount > 0 {
			return TopologyStatusWarning
		}
		return TopologyStatusHealthy
	case notReadyCount > 0:
		return TopologyStatusError
	default:
		return TopologyStatusWarning
	}
}

func collectEndpointAddresses(item corev1.Endpoints) ([]EndpointAddressItem, int, int) {
	addresses := make([]EndpointAddressItem, 0)
	readyCount := 0
	notReadyCount := 0

	appendAddress := func(address corev1.EndpointAddress, ready bool) {
		addresses = append(addresses, EndpointAddressItem{
			IP:         address.IP,
			Ready:      ready,
			NodeName:   ptrString(address.NodeName),
			TargetKind: targetRefKind(address.TargetRef),
			TargetName: targetRefName(address.TargetRef),
		})
	}

	for _, subset := range item.Subsets {
		for _, address := range subset.Addresses {
			appendAddress(address, true)
			readyCount++
		}
		for _, address := range subset.NotReadyAddresses {
			appendAddress(address, false)
			notReadyCount++
		}
	}

	sort.Slice(addresses, func(i, j int) bool {
		if addresses[i].Ready != addresses[j].Ready {
			return addresses[i].Ready
		}
		if addresses[i].TargetName != addresses[j].TargetName {
			return addresses[i].TargetName < addresses[j].TargetName
		}
		return addresses[i].IP < addresses[j].IP
	})

	return addresses, readyCount, notReadyCount
}

func endpointPorts(item corev1.Endpoints) string {
	parts := make([]string, 0)
	for _, subset := range item.Subsets {
		for _, port := range subset.Ports {
			parts = append(parts, fmt.Sprintf("%d/%s", port.Port, strings.ToLower(string(port.Protocol))))
		}
	}
	if len(parts) == 0 {
		return "-"
	}

	sort.Strings(parts)
	return strings.Join(parts, ", ")
}

func targetRefKind(ref *corev1.ObjectReference) string {
	if ref == nil {
		return ""
	}
	return ref.Kind
}

func targetRefName(ref *corev1.ObjectReference) string {
	if ref == nil {
		return ""
	}
	return ref.Name
}

func persistentVolumeStatus(item corev1.PersistentVolume) string {
	switch item.Status.Phase {
	case corev1.VolumeFailed:
		return TopologyStatusError
	case corev1.VolumeReleased, corev1.VolumePending:
		return TopologyStatusWarning
	default:
		return TopologyStatusHealthy
	}
}

func persistentVolumeCapacity(item corev1.PersistentVolume) string {
	if quantity, ok := item.Spec.Capacity[corev1.ResourceStorage]; ok {
		return quantity.String()
	}
	return "-"
}

func persistentVolumeVolumeMode(item corev1.PersistentVolume) string {
	if item.Spec.VolumeMode == nil || strings.TrimSpace(string(*item.Spec.VolumeMode)) == "" {
		return "Filesystem"
	}
	return string(*item.Spec.VolumeMode)
}

func persistentVolumeSource(item corev1.PersistentVolume) string {
	switch {
	case item.Spec.CSI != nil:
		return "CSI"
	case item.Spec.HostPath != nil:
		return "HostPath"
	case item.Spec.NFS != nil:
		return "NFS"
	case item.Spec.Local != nil:
		return "Local"
	case item.Spec.AWSElasticBlockStore != nil:
		return "AWS EBS"
	case item.Spec.GCEPersistentDisk != nil:
		return "GCE PD"
	case item.Spec.AzureDisk != nil:
		return "AzureDisk"
	case item.Spec.AzureFile != nil:
		return "AzureFile"
	case item.Spec.CephFS != nil:
		return "CephFS"
	case item.Spec.RBD != nil:
		return "RBD"
	case item.Spec.ISCSI != nil:
		return "iSCSI"
	case item.Spec.PersistentVolumeSource.FlexVolume != nil:
		return "FlexVolume"
	default:
		return "Other"
	}
}

func storageClassReclaimPolicy(item storagev1.StorageClass) string {
	if item.ReclaimPolicy == nil || strings.TrimSpace(string(*item.ReclaimPolicy)) == "" {
		return string(corev1.PersistentVolumeReclaimDelete)
	}
	return string(*item.ReclaimPolicy)
}

func storageClassVolumeBindingMode(item storagev1.StorageClass) string {
	if item.VolumeBindingMode == nil || strings.TrimSpace(string(*item.VolumeBindingMode)) == "" {
		return string(storagev1.VolumeBindingImmediate)
	}
	return string(*item.VolumeBindingMode)
}

func isDefaultStorageClass(item storagev1.StorageClass) bool {
	return item.Annotations["storageclass.kubernetes.io/is-default-class"] == "true" ||
		item.Annotations["storageclass.beta.kubernetes.io/is-default-class"] == "true"
}

func storageClassParameters(parameters map[string]string) []string {
	if len(parameters) == 0 {
		return nil
	}

	keys := make([]string, 0, len(parameters))
	for key := range parameters {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	items := make([]string, 0, len(keys))
	for _, key := range keys {
		items = append(items, fmt.Sprintf("%s=%s", key, parameters[key]))
	}

	return items
}

func ingressClassStatus(item networkingv1.IngressClass) string {
	if strings.TrimSpace(item.Spec.Controller) == "" {
		return TopologyStatusWarning
	}

	return TopologyStatusHealthy
}

func isDefaultIngressClass(item networkingv1.IngressClass) bool {
	return item.Annotations["ingressclass.kubernetes.io/is-default-class"] == "true"
}

func ingressClassParameters(item networkingv1.IngressClass) *IngressClassParameterRefItem {
	if item.Spec.Parameters == nil {
		return nil
	}

	result := &IngressClassParameterRefItem{
		Kind:  item.Spec.Parameters.Kind,
		Name:  item.Spec.Parameters.Name,
		Scope: defaultString(ptrString(item.Spec.Parameters.Scope), "Cluster"),
	}

	if item.Spec.Parameters.APIGroup != nil {
		result.APIGroup = *item.Spec.Parameters.APIGroup
	}
	if item.Spec.Parameters.Namespace != nil {
		result.Namespace = *item.Spec.Parameters.Namespace
	}

	return result
}

func networkPolicyStatus(item networkingv1.NetworkPolicy, selectedPodCount int) string {
	if len(networkPolicyTypes(item)) == 0 {
		return TopologyStatusWarning
	}
	if selectedPodCount == 0 {
		return TopologyStatusWarning
	}

	return TopologyStatusHealthy
}

func networkPolicySummary(item networkingv1.NetworkPolicy, selectedPodCount int) string {
	return fmt.Sprintf(
		"Pods %d · Ingress %d · Egress %d",
		selectedPodCount,
		len(item.Spec.Ingress),
		len(item.Spec.Egress),
	)
}

func networkPolicyTypes(item networkingv1.NetworkPolicy) []string {
	seen := make(map[string]struct{})
	types := make([]string, 0, 2)

	add := func(value string) {
		value = strings.TrimSpace(value)
		if value == "" {
			return
		}
		if _, exists := seen[value]; exists {
			return
		}
		seen[value] = struct{}{}
		types = append(types, value)
	}

	if len(item.Spec.PolicyTypes) > 0 {
		for _, policyType := range item.Spec.PolicyTypes {
			add(string(policyType))
		}
	} else {
		add(string(networkingv1.PolicyTypeIngress))
		if len(item.Spec.Egress) > 0 {
			add(string(networkingv1.PolicyTypeEgress))
		}
	}

	sort.SliceStable(types, func(i, j int) bool {
		order := func(value string) int {
			switch value {
			case string(networkingv1.PolicyTypeIngress):
				return 0
			case string(networkingv1.PolicyTypeEgress):
				return 1
			default:
				return 2
			}
		}
		leftOrder := order(types[i])
		rightOrder := order(types[j])
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		return types[i] < types[j]
	})

	return types
}

func networkPolicySelectedPods(item networkingv1.NetworkPolicy, pods []corev1.Pod) []string {
	selector, err := metav1.LabelSelectorAsSelector(&item.Spec.PodSelector)
	if err != nil {
		return nil
	}

	selected := make([]string, 0)
	for _, pod := range pods {
		if pod.Namespace != item.Namespace {
			continue
		}
		if selector.Empty() || selector.Matches(labels.Set(pod.Labels)) {
			selected = append(selected, pod.Name)
		}
	}

	sort.Strings(selected)

	return selected
}

func networkPolicyIngressRules(item networkingv1.NetworkPolicy) []NetworkPolicyRuleItem {
	if len(item.Spec.Ingress) == 0 {
		return nil
	}

	rules := make([]NetworkPolicyRuleItem, 0, len(item.Spec.Ingress))
	for _, rule := range item.Spec.Ingress {
		rules = append(rules, NetworkPolicyRuleItem{
			Peers: jsonx.Slice[string](networkPolicyPeerSummaries(rule.From)),
			Ports: jsonx.Slice[string](networkPolicyPortSummaries(rule.Ports)),
		})
	}

	return rules
}

func networkPolicyEgressRules(item networkingv1.NetworkPolicy) []NetworkPolicyRuleItem {
	if len(item.Spec.Egress) == 0 {
		return nil
	}

	rules := make([]NetworkPolicyRuleItem, 0, len(item.Spec.Egress))
	for _, rule := range item.Spec.Egress {
		rules = append(rules, NetworkPolicyRuleItem{
			Peers: jsonx.Slice[string](networkPolicyPeerSummaries(rule.To)),
			Ports: jsonx.Slice[string](networkPolicyPortSummaries(rule.Ports)),
		})
	}

	return rules
}

func networkPolicyPeerSummaries(peers []networkingv1.NetworkPolicyPeer) []string {
	if len(peers) == 0 {
		return nil
	}

	items := make([]string, 0, len(peers))
	for _, peer := range peers {
		switch {
		case peer.IPBlock != nil:
			except := append([]string(nil), peer.IPBlock.Except...)
			sort.Strings(except)
			if len(except) > 0 {
				items = append(items, fmt.Sprintf("IPBlock %s except [%s]", peer.IPBlock.CIDR, strings.Join(except, ", ")))
			} else {
				items = append(items, fmt.Sprintf("IPBlock %s", peer.IPBlock.CIDR))
			}
		case peer.NamespaceSelector != nil && peer.PodSelector != nil:
			items = append(
				items,
				fmt.Sprintf(
					"Namespace %s · Pod %s",
					strings.Join(selectorPairs(peer.NamespaceSelector), ", "),
					strings.Join(selectorPairs(peer.PodSelector), ", "),
				),
			)
		case peer.NamespaceSelector != nil:
			items = append(items, fmt.Sprintf("Namespace %s", strings.Join(selectorPairs(peer.NamespaceSelector), ", ")))
		case peer.PodSelector != nil:
			items = append(items, fmt.Sprintf("Pod %s", strings.Join(selectorPairs(peer.PodSelector), ", ")))
		default:
			items = append(items, "All")
		}
	}

	return items
}

func networkPolicyPortSummaries(ports []networkingv1.NetworkPolicyPort) []string {
	if len(ports) == 0 {
		return nil
	}

	items := make([]string, 0, len(ports))
	for _, port := range ports {
		protocol := string(corev1.ProtocolTCP)
		if port.Protocol != nil && strings.TrimSpace(string(*port.Protocol)) != "" {
			protocol = string(*port.Protocol)
		}

		switch {
		case port.Port == nil:
			items = append(items, fmt.Sprintf("%s/all", protocol))
		case port.EndPort != nil && port.Port.Type == 0:
			items = append(items, fmt.Sprintf("%s/%d-%d", protocol, port.Port.IntVal, *port.EndPort))
		default:
			items = append(items, fmt.Sprintf("%s/%s", protocol, port.Port.String()))
		}
	}

	sort.Strings(items)

	return items
}

func deploymentListStatus(item appsv1.Deployment) string {
	desired := desiredReplicas(item.Spec.Replicas)

	switch {
	case desired == 0:
		return "ScaledDown"
	case item.Status.AvailableReplicas == 0:
		return "Degraded"
	case item.Status.AvailableReplicas >= desired && item.Status.UpdatedReplicas >= desired:
		return "Healthy"
	default:
		return "Progressing"
	}
}

func statefulSetListStatus(item appsv1.StatefulSet) string {
	desired := desiredReplicas(item.Spec.Replicas)

	switch {
	case desired == 0:
		return "ScaledDown"
	case item.Status.ReadyReplicas == 0:
		return "Degraded"
	case item.Status.ReadyReplicas >= desired && item.Status.UpdatedReplicas >= desired:
		return "Healthy"
	default:
		return "Progressing"
	}
}

func replicaSetListStatus(item appsv1.ReplicaSet) string {
	desired := desiredReplicas(item.Spec.Replicas)

	switch {
	case desired == 0:
		return "ScaledDown"
	case item.Status.ReadyReplicas == 0:
		return "Degraded"
	case item.Status.ReadyReplicas >= desired && item.Status.AvailableReplicas >= desired:
		return "Healthy"
	default:
		return "Progressing"
	}
}

func daemonSetListStatus(item appsv1.DaemonSet) string {
	switch {
	case item.Status.DesiredNumberScheduled == 0:
		return "ScaledDown"
	case item.Status.NumberReady == 0:
		return "Degraded"
	case item.Status.NumberReady >= item.Status.DesiredNumberScheduled && item.Status.NumberUnavailable == 0:
		return "Healthy"
	default:
		return "Progressing"
	}
}

func deploymentStatusOrder(status string) int {
	switch status {
	case "Degraded":
		return 0
	case "Progressing":
		return 1
	case "Healthy", "ScaledDown":
		return 2
	default:
		return 3
	}
}

func statefulSetStatusOrder(status string) int {
	switch status {
	case "Degraded":
		return 0
	case "Progressing":
		return 1
	case "Healthy", "ScaledDown":
		return 2
	default:
		return 3
	}
}

func replicaSetStatusOrder(status string) int {
	switch status {
	case "Degraded":
		return 0
	case "Progressing":
		return 1
	case "Healthy", "ScaledDown":
		return 2
	default:
		return 3
	}
}

func daemonSetStatusOrder(status string) int {
	switch status {
	case "Degraded":
		return 0
	case "Progressing":
		return 1
	case "Healthy", "ScaledDown":
		return 2
	default:
		return 3
	}
}

func jobListStatus(item batchv1.Job) string {
	switch {
	case jobSuspended(item):
		return "Suspended"
	case jobFinishedFailed(item):
		return "Failed"
	case jobFinishedComplete(item):
		return "Completed"
	case item.Status.Active > 0:
		return "Running"
	case item.Status.Failed > 0:
		return "Retrying"
	default:
		return "Pending"
	}
}

func cronJobListStatus(item batchv1.CronJob, jobs []batchv1.Job) string {
	switch {
	case item.Spec.Suspend != nil && *item.Spec.Suspend:
		return "Suspended"
	case len(item.Status.Active) > 0:
		return "Running"
	case hasFailedJob(jobs):
		return "Failed"
	case hasCompletedJob(jobs):
		return "Healthy"
	default:
		return "Scheduled"
	}
}

func jobStatusOrder(status string) int {
	switch status {
	case "Failed":
		return 0
	case "Retrying":
		return 1
	case "Running":
		return 2
	case "Pending":
		return 3
	case "Suspended":
		return 4
	case "Completed", "Healthy", "Scheduled":
		return 5
	default:
		return 6
	}
}

func cronJobStatusOrder(status string) int {
	switch status {
	case "Failed":
		return 0
	case "Running":
		return 1
	case "Suspended":
		return 2
	case "Scheduled":
		return 3
	case "Healthy":
		return 4
	default:
		return 5
	}
}

func podListStatus(pod corev1.Pod) string {
	if pod.DeletionTimestamp != nil {
		return "Terminating"
	}

	if reason := strings.TrimSpace(pod.Status.Reason); reason != "" {
		return reason
	}

	for _, status := range pod.Status.InitContainerStatuses {
		if reason := containerStatusReason(status); reason != "" {
			return reason
		}
	}

	for _, status := range pod.Status.ContainerStatuses {
		if reason := containerStatusReason(status); reason != "" {
			return reason
		}
	}

	if pod.Status.Phase != "" {
		return string(pod.Status.Phase)
	}

	return "Unknown"
}

func podStatusOrder(status string) int {
	switch status {
	case "Failed", "Unknown", "CrashLoopBackOff", "ImagePullBackOff", "ErrImagePull", "CreateContainerConfigError", "RunContainerError", "Terminating":
		return 0
	case "Pending", "ContainerCreating":
		return 1
	case "Running":
		return 2
	case "Succeeded", "Completed":
		return 3
	default:
		return 2
	}
}

func nodePodCounts(items []corev1.Pod) map[string]int {
	counts := make(map[string]int)
	for _, item := range items {
		if item.Spec.NodeName == "" {
			continue
		}
		if item.Status.Phase == corev1.PodSucceeded || item.Status.Phase == corev1.PodFailed {
			continue
		}

		counts[item.Spec.NodeName]++
	}

	return counts
}

func nodeMetricsIndex(items []metricsv1beta1.NodeMetrics) map[string]metricsv1beta1.NodeMetrics {
	index := make(map[string]metricsv1beta1.NodeMetrics, len(items))
	for _, item := range items {
		index[item.Name] = item
	}

	return index
}

func podMetricsKey(namespace string, name string) string {
	return namespace + "/" + name
}

func podMetricsIndex(items []metricsv1beta1.PodMetrics) map[string]metricsv1beta1.PodMetrics {
	index := make(map[string]metricsv1beta1.PodMetrics, len(items))
	for _, item := range items {
		index[podMetricsKey(item.Namespace, item.Name)] = item
	}

	return index
}

func filterPodsBySelector(
	items []corev1.Pod,
	namespace string,
	selector labels.Selector,
) []corev1.Pod {
	if selector == nil || selector.Empty() {
		return nil
	}

	matched := make([]corev1.Pod, 0)
	for _, item := range items {
		if namespace != "" && item.Namespace != namespace {
			continue
		}
		if selector.Matches(labels.Set(item.Labels)) {
			matched = append(matched, item)
		}
	}

	return matched
}

func aggregateWorkloadPods(
	pods []corev1.Pod,
	metricsByPod map[string]metricsv1beta1.PodMetrics,
) ([]DeploymentPodItem, string, string, bool, int) {
	deploymentPods := make([]DeploymentPodItem, 0, len(pods))
	totalCPUUsage := resource.NewMilliQuantity(0, resource.DecimalSI)
	totalMemoryUsage := resource.NewQuantity(0, resource.BinarySI)
	metricsAvailableCount := 0
	restartCount := 0

	for _, item := range pods {
		podItem := DeploymentPodItem{
			Name:            item.Name,
			Status:          podListStatus(item),
			ReadyContainers: podReadyContainerCount(item),
			TotalContainers: len(item.Spec.Containers),
			RestartCount:    podListRestartCount(item),
			NodeName:        item.Spec.NodeName,
		}

		restartCount += podItem.RestartCount

		if metrics, ok := metricsByPod[podMetricsKey(item.Namespace, item.Name)]; ok {
			podItem.MetricsAvailable = true
			podItem.CPUUsage, podItem.MemoryUsage = podMetricSummary(metrics)
			if cpu := podMetricCPU(metrics); cpu != nil {
				totalCPUUsage.Add(*cpu)
			}
			if memory := podMetricMemory(metrics); memory != nil {
				totalMemoryUsage.Add(*memory)
			}
			metricsAvailableCount++
		}

		deploymentPods = append(deploymentPods, podItem)
	}

	sort.Slice(deploymentPods, func(i, j int) bool {
		leftOrder := podStatusOrder(deploymentPods[i].Status)
		rightOrder := podStatusOrder(deploymentPods[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		return deploymentPods[i].Name < deploymentPods[j].Name
	})

	if metricsAvailableCount == 0 {
		return deploymentPods, "", "", false, restartCount
	}

	return deploymentPods, formatMilliCPUQuantity(totalCPUUsage), formatBinaryQuantity(totalMemoryUsage), true, restartCount
}

func podReadyContainerCount(pod corev1.Pod) int {
	count := 0
	for _, item := range pod.Status.ContainerStatuses {
		if item.Ready {
			count++
		}
	}

	return count
}

func podListRestartCount(pod corev1.Pod) int {
	count := 0
	for _, item := range pod.Status.InitContainerStatuses {
		count += int(item.RestartCount)
	}
	for _, item := range pod.Status.ContainerStatuses {
		count += int(item.RestartCount)
	}

	return count
}

func containerStatusReason(status corev1.ContainerStatus) string {
	switch {
	case status.State.Waiting != nil && strings.TrimSpace(status.State.Waiting.Reason) != "":
		return status.State.Waiting.Reason
	case status.State.Terminated != nil && strings.TrimSpace(status.State.Terminated.Reason) != "":
		return status.State.Terminated.Reason
	default:
		return ""
	}
}

func containerState(status *corev1.ContainerStatus) string {
	if status == nil {
		return "Unknown"
	}

	switch {
	case status.State.Running != nil:
		return "Running"
	case status.State.Waiting != nil:
		if reason := strings.TrimSpace(status.State.Waiting.Reason); reason != "" {
			return reason
		}
		return "Waiting"
	case status.State.Terminated != nil:
		if reason := strings.TrimSpace(status.State.Terminated.Reason); reason != "" {
			return reason
		}
		return fmt.Sprintf("Exit %d", status.State.Terminated.ExitCode)
	default:
		return "Unknown"
	}
}

func formatContainerTimestamp(value metav1.Time) string {
	if value.IsZero() {
		return ""
	}

	return value.Time.Format("2006-01-02 15:04:05")
}

func containerStateDetails(state corev1.ContainerState) (
	reason string,
	message string,
	startedAt string,
	finishedAt string,
	exitCode *int32,
) {
	switch {
	case state.Waiting != nil:
		reason = strings.TrimSpace(state.Waiting.Reason)
		message = strings.TrimSpace(state.Waiting.Message)
	case state.Running != nil:
		startedAt = formatContainerTimestamp(state.Running.StartedAt)
	case state.Terminated != nil:
		reason = strings.TrimSpace(state.Terminated.Reason)
		message = strings.TrimSpace(state.Terminated.Message)
		startedAt = formatContainerTimestamp(state.Terminated.StartedAt)
		finishedAt = formatContainerTimestamp(state.Terminated.FinishedAt)
		exitCode = &state.Terminated.ExitCode
	}

	return reason, message, startedAt, finishedAt, exitCode
}

func collectPodContainers(
	pod corev1.Pod,
	metrics metricsv1beta1.PodMetrics,
) ([]PodContainerItem, string, string, bool) {
	statuses := make(map[string]corev1.ContainerStatus, len(pod.Status.ContainerStatuses))
	for _, item := range pod.Status.ContainerStatuses {
		statuses[item.Name] = item
	}

	metricsByContainer := make(map[string]metricsv1beta1.ContainerMetrics, len(metrics.Containers))
	totalCPUUsage := resource.NewMilliQuantity(0, resource.DecimalSI)
	totalMemoryUsage := resource.NewQuantity(0, resource.BinarySI)
	for _, item := range metrics.Containers {
		metricsByContainer[item.Name] = item
		if cpu := item.Usage.Cpu(); cpu != nil {
			totalCPUUsage.Add(*cpu)
		}
		if memory := item.Usage.Memory(); memory != nil {
			totalMemoryUsage.Add(*memory)
		}
	}

	containers := make([]PodContainerItem, 0, len(pod.Spec.Containers))
	for _, item := range pod.Spec.Containers {
		status, hasStatus := statuses[item.Name]
		container := PodContainerItem{
			Name:  item.Name,
			Image: item.Image,
		}
		if hasStatus {
			container.Ready = status.Ready
			container.RestartCount = int(status.RestartCount)
			container.State = containerState(&status)
			container.StateReason,
				container.StateMessage,
				container.StartedAt,
				container.FinishedAt,
				container.ExitCode = containerStateDetails(status.State)
			if status.LastTerminationState != (corev1.ContainerState{}) {
				container.LastState = containerState(&corev1.ContainerStatus{State: status.LastTerminationState})
				container.LastStateReason,
					_,
					container.LastStartedAt,
					container.LastFinishedAt,
					container.LastExitCode = containerStateDetails(status.LastTerminationState)
			}
		} else {
			container.State = "Unknown"
		}

		if metricsItem, ok := metricsByContainer[item.Name]; ok {
			container.CPUUsage = formatMilliCPUQuantity(metricsItem.Usage.Cpu())
			container.MemoryUsage = formatBinaryQuantity(metricsItem.Usage.Memory())
		}

		containers = append(containers, container)
	}

	metricsAvailable := len(metrics.Containers) > 0
	if !metricsAvailable {
		return containers, "", "", false
	}

	return containers, formatMilliCPUQuantity(totalCPUUsage), formatBinaryQuantity(totalMemoryUsage), true
}

func collectPodConditions(pod corev1.Pod) []PodConditionItem {
	if len(pod.Status.Conditions) == 0 {
		return nil
	}

	order := map[string]int{
		string(corev1.PodReady):        0,
		string(corev1.ContainersReady): 1,
		string(corev1.PodScheduled):    2,
		string(corev1.PodInitialized):  3,
	}

	conditions := append([]corev1.PodCondition(nil), pod.Status.Conditions...)
	sort.SliceStable(conditions, func(i, j int) bool {
		leftOrder, leftOk := order[string(conditions[i].Type)]
		rightOrder, rightOk := order[string(conditions[j].Type)]
		switch {
		case leftOk && rightOk:
			return leftOrder < rightOrder
		case leftOk:
			return true
		case rightOk:
			return false
		default:
			return string(conditions[i].Type) < string(conditions[j].Type)
		}
	})

	result := make([]PodConditionItem, 0, len(conditions))
	for _, item := range conditions {
		result = append(result, PodConditionItem{
			Type:    string(item.Type),
			Status:  string(item.Status),
			Reason:  item.Reason,
			Message: item.Message,
		})
	}

	return result
}

func deploymentImages(items []corev1.Container) []string {
	if len(items) == 0 {
		return nil
	}

	images := make([]string, 0, len(items))
	for _, item := range items {
		images = append(images, fmt.Sprintf("%s=%s", item.Name, item.Image))
	}

	sort.Strings(images)

	return images
}

func selectorPairs(selector *metav1.LabelSelector) []string {
	if selector == nil {
		return nil
	}

	pairs := labelPairs(selector.MatchLabels)
	for _, item := range selector.MatchExpressions {
		values := append([]string(nil), item.Values...)
		sort.Strings(values)
		pairs = append(
			pairs,
			fmt.Sprintf("%s %s [%s]", item.Key, item.Operator, strings.Join(values, ",")),
		)
	}

	sort.Strings(pairs)

	return pairs
}

func collectDeploymentConditions(item appsv1.Deployment) []DeploymentConditionItem {
	if len(item.Status.Conditions) == 0 {
		return nil
	}

	conditions := append([]appsv1.DeploymentCondition(nil), item.Status.Conditions...)
	sort.SliceStable(conditions, func(i, j int) bool {
		return string(conditions[i].Type) < string(conditions[j].Type)
	})

	result := make([]DeploymentConditionItem, 0, len(conditions))
	for _, condition := range conditions {
		result = append(result, DeploymentConditionItem{
			Type:           string(condition.Type),
			Status:         string(condition.Status),
			Reason:         condition.Reason,
			Message:        condition.Message,
			LastUpdateTime: condition.LastUpdateTime.Time.Format("2006-01-02 15:04:05"),
		})
	}

	return result
}

func collectStatefulSetConditions(item appsv1.StatefulSet) []StatefulSetConditionItem {
	if len(item.Status.Conditions) == 0 {
		return nil
	}

	conditions := append([]appsv1.StatefulSetCondition(nil), item.Status.Conditions...)
	sort.SliceStable(conditions, func(i, j int) bool {
		return string(conditions[i].Type) < string(conditions[j].Type)
	})

	result := make([]StatefulSetConditionItem, 0, len(conditions))
	for _, condition := range conditions {
		result = append(result, StatefulSetConditionItem{
			Type:           string(condition.Type),
			Status:         string(condition.Status),
			Reason:         condition.Reason,
			Message:        condition.Message,
			LastUpdateTime: condition.LastTransitionTime.Time.Format("2006-01-02 15:04:05"),
		})
	}

	return result
}

func collectReplicaSetConditions(item appsv1.ReplicaSet) []ReplicaSetConditionItem {
	if len(item.Status.Conditions) == 0 {
		return nil
	}

	conditions := append([]appsv1.ReplicaSetCondition(nil), item.Status.Conditions...)
	sort.SliceStable(conditions, func(i, j int) bool {
		return string(conditions[i].Type) < string(conditions[j].Type)
	})

	result := make([]ReplicaSetConditionItem, 0, len(conditions))
	for _, condition := range conditions {
		result = append(result, ReplicaSetConditionItem{
			Type:           string(condition.Type),
			Status:         string(condition.Status),
			Reason:         condition.Reason,
			Message:        condition.Message,
			LastUpdateTime: condition.LastTransitionTime.Time.Format("2006-01-02 15:04:05"),
		})
	}

	return result
}

func collectDaemonSetConditions(item appsv1.DaemonSet) []DaemonSetConditionItem {
	if len(item.Status.Conditions) == 0 {
		return nil
	}

	conditions := append([]appsv1.DaemonSetCondition(nil), item.Status.Conditions...)
	sort.SliceStable(conditions, func(i, j int) bool {
		return string(conditions[i].Type) < string(conditions[j].Type)
	})

	result := make([]DaemonSetConditionItem, 0, len(conditions))
	for _, condition := range conditions {
		result = append(result, DaemonSetConditionItem{
			Type:           string(condition.Type),
			Status:         string(condition.Status),
			Reason:         condition.Reason,
			Message:        condition.Message,
			LastUpdateTime: condition.LastTransitionTime.Time.Format("2006-01-02 15:04:05"),
		})
	}

	return result
}

func collectJobConditions(item batchv1.Job) []JobConditionItem {
	if len(item.Status.Conditions) == 0 {
		return nil
	}

	conditions := append([]batchv1.JobCondition(nil), item.Status.Conditions...)
	sort.SliceStable(conditions, func(i, j int) bool {
		return string(conditions[i].Type) < string(conditions[j].Type)
	})

	result := make([]JobConditionItem, 0, len(conditions))
	for _, condition := range conditions {
		result = append(result, JobConditionItem{
			Type:           string(condition.Type),
			Status:         string(condition.Status),
			Reason:         condition.Reason,
			Message:        condition.Message,
			LastUpdateTime: condition.LastTransitionTime.Time.Format("2006-01-02 15:04:05"),
		})
	}

	return result
}

func podMetricCPU(metrics metricsv1beta1.PodMetrics) *resource.Quantity {
	total := resource.NewMilliQuantity(0, resource.DecimalSI)
	for _, item := range metrics.Containers {
		if cpu := item.Usage.Cpu(); cpu != nil {
			total.Add(*cpu)
		}
	}

	return total
}

func podMetricMemory(metrics metricsv1beta1.PodMetrics) *resource.Quantity {
	total := resource.NewQuantity(0, resource.BinarySI)
	for _, item := range metrics.Containers {
		if memory := item.Usage.Memory(); memory != nil {
			total.Add(*memory)
		}
	}

	return total
}

func podMetricSummary(metrics metricsv1beta1.PodMetrics) (string, string) {
	return formatMilliCPUQuantity(podMetricCPU(metrics)), formatBinaryQuantity(podMetricMemory(metrics))
}

func collectNodeConditions(node corev1.Node) []NodeConditionItem {
	if len(node.Status.Conditions) == 0 {
		return nil
	}

	order := map[corev1.NodeConditionType]int{
		corev1.NodeReady:              0,
		corev1.NodeMemoryPressure:     1,
		corev1.NodeDiskPressure:       2,
		corev1.NodePIDPressure:        3,
		corev1.NodeNetworkUnavailable: 4,
	}

	conditions := append([]corev1.NodeCondition(nil), node.Status.Conditions...)
	sort.SliceStable(conditions, func(i, j int) bool {
		leftOrder, leftOk := order[conditions[i].Type]
		rightOrder, rightOk := order[conditions[j].Type]
		switch {
		case leftOk && rightOk:
			return leftOrder < rightOrder
		case leftOk:
			return true
		case rightOk:
			return false
		default:
			return string(conditions[i].Type) < string(conditions[j].Type)
		}
	})

	result := make([]NodeConditionItem, 0, len(conditions))
	for _, item := range conditions {
		result = append(result, NodeConditionItem{
			Type:               string(item.Type),
			Status:             string(item.Status),
			Reason:             item.Reason,
			Message:            item.Message,
			LastTransitionTime: item.LastTransitionTime.Time.Format("2006-01-02 15:04:05"),
		})
	}

	return result
}

func collectNodeTaints(node corev1.Node) []NodeTaintItem {
	if len(node.Spec.Taints) == 0 {
		return nil
	}

	result := make([]NodeTaintItem, 0, len(node.Spec.Taints))
	for _, item := range node.Spec.Taints {
		result = append(result, NodeTaintItem{
			Key:    item.Key,
			Value:  item.Value,
			Effect: string(item.Effect),
		})
	}

	sort.Slice(result, func(i, j int) bool {
		if result[i].Key != result[j].Key {
			return result[i].Key < result[j].Key
		}
		return result[i].Effect < result[j].Effect
	})

	return result
}

func formatMilliCPUQuantity(quantity *resource.Quantity) string {
	if quantity == nil {
		return "-"
	}

	return fmt.Sprintf("%dm", quantity.MilliValue())
}

func formatBinaryQuantity(quantity *resource.Quantity) string {
	if quantity == nil {
		return "-"
	}

	return formatBinaryBytes(quantity.Value())
}

func quantityMilliValue(quantity *resource.Quantity) int64 {
	if quantity == nil {
		return 0
	}

	return quantity.MilliValue()
}

func quantityValue(quantity *resource.Quantity) int64 {
	if quantity == nil {
		return 0
	}

	return quantity.Value()
}

func formatBinaryBytes(value int64) string {
	if value <= 0 {
		return "0 B"
	}

	type unit struct {
		name string
		size float64
	}

	units := []unit{
		{name: "TiB", size: 1024 * 1024 * 1024 * 1024},
		{name: "GiB", size: 1024 * 1024 * 1024},
		{name: "MiB", size: 1024 * 1024},
		{name: "KiB", size: 1024},
	}

	floatValue := float64(value)
	for _, item := range units {
		if floatValue >= item.size {
			return fmt.Sprintf("%.1f %s", floatValue/item.size, item.name)
		}
	}

	return fmt.Sprintf("%d B", value)
}

func ageString(createdAt time.Time) string {
	if createdAt.IsZero() {
		return "-"
	}

	duration := time.Since(createdAt)
	switch {
	case duration < time.Minute:
		return "<1m"
	case duration < time.Hour:
		return fmt.Sprintf("%dm", int(duration/time.Minute))
	case duration < 24*time.Hour:
		return fmt.Sprintf("%dh", int(duration/time.Hour))
	case duration < 30*24*time.Hour:
		return fmt.Sprintf("%dd", int(duration/(24*time.Hour)))
	case duration < 365*24*time.Hour:
		return fmt.Sprintf("%dmo", int(duration/(30*24*time.Hour)))
	default:
		return fmt.Sprintf("%dy", int(duration/(365*24*time.Hour)))
	}
}

func optionalInt32(value *int32) int32 {
	if value == nil {
		return 0
	}

	return *value
}

func timeString(value *metav1.Time) string {
	if value == nil || value.IsZero() {
		return ""
	}

	return value.Time.Format("2006-01-02 15:04:05")
}

func jobCompletionMode(value *batchv1.CompletionMode) string {
	if value == nil {
		return "NonIndexed"
	}

	return string(*value)
}

func cronJobTimeZone(item batchv1.CronJob) string {
	if item.Spec.TimeZone == nil {
		return ""
	}

	return strings.TrimSpace(*item.Spec.TimeZone)
}

func jobSuspended(item batchv1.Job) bool {
	return item.Spec.Suspend != nil && *item.Spec.Suspend
}

func jobFinishedComplete(item batchv1.Job) bool {
	for _, condition := range item.Status.Conditions {
		if condition.Type == batchv1.JobComplete && condition.Status == corev1.ConditionTrue {
			return true
		}
	}

	desired := desiredReplicas(item.Spec.Completions)
	return desired > 0 && item.Status.Succeeded >= desired
}

func jobFinishedFailed(item batchv1.Job) bool {
	for _, condition := range item.Status.Conditions {
		if condition.Type == batchv1.JobFailed && condition.Status == corev1.ConditionTrue {
			return true
		}
	}

	return item.Status.Failed > 0 && item.Status.Active == 0 && item.Status.Succeeded == 0
}

func hasFailedJob(items []batchv1.Job) bool {
	for _, item := range items {
		if jobFinishedFailed(item) {
			return true
		}
	}

	return false
}

func hasCompletedJob(items []batchv1.Job) bool {
	for _, item := range items {
		if jobFinishedComplete(item) {
			return true
		}
	}

	return false
}

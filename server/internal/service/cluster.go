package service

import (
	"bytes"
	"context"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"math"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"time"

	yamlv3 "gopkg.in/yaml.v3"
	admissionregistrationv1 "k8s.io/api/admissionregistration/v1"
	appsv1 "k8s.io/api/apps/v1"
	authv1 "k8s.io/api/authentication/v1"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	storagev1 "k8s.io/api/storage/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
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

type ValidationError struct {
	message string
}

func (e ValidationError) Error() string {
	return e.message
}

func newValidationError(format string, args ...any) error {
	return ValidationError{
		message: fmt.Sprintf(format, args...),
	}
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

type ConfigMapItem struct {
	Name               string              `json:"name"`
	Namespace          string              `json:"namespace"`
	Status             string              `json:"status"`
	Summary            string              `json:"summary"`
	Immutable          bool                `json:"immutable"`
	DataKeys           jsonx.Slice[string] `json:"dataKeys"`
	BinaryDataKeys     jsonx.Slice[string] `json:"binaryDataKeys"`
	DataCount          int                 `json:"dataCount"`
	BinaryDataCount    int                 `json:"binaryDataCount"`
	ReferencedPodCount int                 `json:"referencedPodCount"`
	ReferencedPods     jsonx.Slice[string] `json:"referencedPods"`
	Labels             jsonx.Slice[string] `json:"labels"`
	Age                string              `json:"age"`
	CreatedAt          string              `json:"createdAt"`
}

type SecretItem struct {
	Name               string              `json:"name"`
	Namespace          string              `json:"namespace"`
	Status             string              `json:"status"`
	Type               string              `json:"type"`
	Summary            string              `json:"summary"`
	Immutable          bool                `json:"immutable"`
	DataKeys           jsonx.Slice[string] `json:"dataKeys"`
	DataCount          int                 `json:"dataCount"`
	ReferencedPodCount int                 `json:"referencedPodCount"`
	ReferencedPods     jsonx.Slice[string] `json:"referencedPods"`
	Labels             jsonx.Slice[string] `json:"labels"`
	Age                string              `json:"age"`
	CreatedAt          string              `json:"createdAt"`
}

type ServiceAccountItem struct {
	Name                 string              `json:"name"`
	Namespace            string              `json:"namespace"`
	Status               string              `json:"status"`
	Summary              string              `json:"summary"`
	AutomountToken       string              `json:"automountToken"`
	SecretNames          jsonx.Slice[string] `json:"secretNames"`
	SecretCount          int                 `json:"secretCount"`
	ImagePullSecrets     jsonx.Slice[string] `json:"imagePullSecrets"`
	ImagePullSecretCount int                 `json:"imagePullSecretCount"`
	ReferencedPodCount   int                 `json:"referencedPodCount"`
	ReferencedPods       jsonx.Slice[string] `json:"referencedPods"`
	Labels               jsonx.Slice[string] `json:"labels"`
	Age                  string              `json:"age"`
	CreatedAt            string              `json:"createdAt"`
}

type RoleRuleItem struct {
	APIGroups       jsonx.Slice[string] `json:"apiGroups"`
	Resources       jsonx.Slice[string] `json:"resources"`
	ResourceNames   jsonx.Slice[string] `json:"resourceNames"`
	NonResourceURLs jsonx.Slice[string] `json:"nonResourceUrls"`
	Verbs           jsonx.Slice[string] `json:"verbs"`
}

type RoleItem struct {
	Name              string                    `json:"name"`
	Namespace         string                    `json:"namespace"`
	Status            string                    `json:"status"`
	Summary           string                    `json:"summary"`
	RuleCount         int                       `json:"ruleCount"`
	BoundSubjectCount int                       `json:"boundSubjectCount"`
	BoundSubjects     jsonx.Slice[string]       `json:"boundSubjects"`
	Rules             jsonx.Slice[RoleRuleItem] `json:"rules"`
	Labels            jsonx.Slice[string]       `json:"labels"`
	Age               string                    `json:"age"`
	CreatedAt         string                    `json:"createdAt"`
}

type RoleBindingSubjectItem struct {
	Kind      string `json:"kind"`
	Name      string `json:"name"`
	Namespace string `json:"namespace,omitempty"`
	APIGroup  string `json:"apiGroup,omitempty"`
}

type RoleBindingItem struct {
	Name             string                              `json:"name"`
	Namespace        string                              `json:"namespace"`
	Status           string                              `json:"status"`
	Summary          string                              `json:"summary"`
	RoleRefKind      string                              `json:"roleRefKind"`
	RoleRefName      string                              `json:"roleRefName"`
	RoleRefAPIGroup  string                              `json:"roleRefApiGroup,omitempty"`
	SubjectCount     int                                 `json:"subjectCount"`
	SubjectSummaries jsonx.Slice[string]                 `json:"subjectSummaries"`
	Subjects         jsonx.Slice[RoleBindingSubjectItem] `json:"subjects"`
	Labels           jsonx.Slice[string]                 `json:"labels"`
	Age              string                              `json:"age"`
	CreatedAt        string                              `json:"createdAt"`
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

type HPAMetricItem struct {
	Type      string `json:"type"`
	Name      string `json:"name"`
	Target    string `json:"target,omitempty"`
	Current   string `json:"current,omitempty"`
	Summary   string `json:"summary,omitempty"`
	Container string `json:"container,omitempty"`
	Selector  string `json:"selector,omitempty"`
}

type HPAConditionItem struct {
	Type               string `json:"type"`
	Status             string `json:"status"`
	Reason             string `json:"reason,omitempty"`
	Message            string `json:"message,omitempty"`
	LastTransitionTime string `json:"lastTransitionTime,omitempty"`
}

type HPAItem struct {
	Name                  string                        `json:"name"`
	Namespace             string                        `json:"namespace"`
	Status                string                        `json:"status"`
	Summary               string                        `json:"summary"`
	ScaleTargetKind       string                        `json:"scaleTargetKind"`
	ScaleTargetName       string                        `json:"scaleTargetName"`
	ScaleTargetAPIVersion string                        `json:"scaleTargetApiVersion"`
	MinReplicas           int32                         `json:"minReplicas"`
	MaxReplicas           int32                         `json:"maxReplicas"`
	CurrentReplicas       int32                         `json:"currentReplicas"`
	DesiredReplicas       int32                         `json:"desiredReplicas"`
	MetricCount           int                           `json:"metricCount"`
	Metrics               jsonx.Slice[HPAMetricItem]    `json:"metrics"`
	ConditionCount        int                           `json:"conditionCount"`
	Conditions            jsonx.Slice[HPAConditionItem] `json:"conditions"`
	BehaviorSummary       string                        `json:"behaviorSummary,omitempty"`
	Labels                jsonx.Slice[string]           `json:"labels"`
	Age                   string                        `json:"age"`
	CreatedAt             string                        `json:"createdAt"`
	LastScaleTime         string                        `json:"lastScaleTime,omitempty"`
}

type VPAConditionItem struct {
	Type               string `json:"type"`
	Status             string `json:"status"`
	Reason             string `json:"reason,omitempty"`
	Message            string `json:"message,omitempty"`
	LastTransitionTime string `json:"lastTransitionTime,omitempty"`
}

type VPAContainerPolicyItem struct {
	ContainerName       string              `json:"containerName"`
	Mode                string              `json:"mode,omitempty"`
	ControlledResources jsonx.Slice[string] `json:"controlledResources"`
	ControlledValues    string              `json:"controlledValues,omitempty"`
	MinAllowed          jsonx.Slice[string] `json:"minAllowed"`
	MaxAllowed          jsonx.Slice[string] `json:"maxAllowed"`
	Summary             string              `json:"summary"`
}

type VPARecommendationItem struct {
	ContainerName  string              `json:"containerName"`
	Target         jsonx.Slice[string] `json:"target"`
	LowerBound     jsonx.Slice[string] `json:"lowerBound"`
	UpperBound     jsonx.Slice[string] `json:"upperBound"`
	UncappedTarget jsonx.Slice[string] `json:"uncappedTarget"`
	Summary        string              `json:"summary"`
}

type VPAInsightItem struct {
	Level   string `json:"level"`
	Code    string `json:"code"`
	Summary string `json:"summary"`
	Detail  string `json:"detail,omitempty"`
}

type VPAClusterReadinessCheck struct {
	Key     string `json:"key"`
	Label   string `json:"label"`
	Status  string `json:"status"`
	Summary string `json:"summary"`
	Detail  string `json:"detail,omitempty"`
}

type VPAClusterReadiness struct {
	Status             string                                `json:"status"`
	Summary            string                                `json:"summary"`
	UpdaterMinReplicas int                                   `json:"updaterMinReplicas"`
	Checks             jsonx.Slice[VPAClusterReadinessCheck] `json:"checks"`
}

type VPAItem struct {
	Name                  string                              `json:"name"`
	Namespace             string                              `json:"namespace"`
	Status                string                              `json:"status"`
	Summary               string                              `json:"summary"`
	ScaleTargetKind       string                              `json:"scaleTargetKind"`
	ScaleTargetName       string                              `json:"scaleTargetName"`
	ScaleTargetAPIVersion string                              `json:"scaleTargetApiVersion"`
	UpdateMode            string                              `json:"updateMode"`
	EffectivenessStatus   string                              `json:"effectivenessStatus"`
	EffectivenessSummary  string                              `json:"effectivenessSummary"`
	TargetReplicaCount    int                                 `json:"targetReplicaCount"`
	MatchedPodCount       int                                 `json:"matchedPodCount"`
	AppliedPodCount       int                                 `json:"appliedPodCount"`
	ContainerPolicyCount  int                                 `json:"containerPolicyCount"`
	RecommendationCount   int                                 `json:"recommendationCount"`
	ConditionCount        int                                 `json:"conditionCount"`
	ResourcePolicies      jsonx.Slice[VPAContainerPolicyItem] `json:"resourcePolicies"`
	Recommendations       jsonx.Slice[VPARecommendationItem]  `json:"recommendations"`
	Conditions            jsonx.Slice[VPAConditionItem]       `json:"conditions"`
	Insights              jsonx.Slice[VPAInsightItem]         `json:"insights"`
	Labels                jsonx.Slice[string]                 `json:"labels"`
	Age                   string                              `json:"age"`
	CreatedAt             string                              `json:"createdAt"`
}

type vpaTargetReference struct {
	APIVersion string `json:"apiVersion"`
	Kind       string `json:"kind"`
	Name       string `json:"name"`
}

type vpaUpdatePolicy struct {
	UpdateMode *string `json:"updateMode"`
}

type vpaContainerPolicy struct {
	ContainerName       string              `json:"containerName"`
	Mode                *string             `json:"mode"`
	ControlledResources jsonx.Slice[string] `json:"controlledResources"`
	ControlledValues    *string             `json:"controlledValues"`
	MinAllowed          corev1.ResourceList `json:"minAllowed"`
	MaxAllowed          corev1.ResourceList `json:"maxAllowed"`
}

type vpaResourcePolicy struct {
	ContainerPolicies []vpaContainerPolicy `json:"containerPolicies"`
}

type vpaSpec struct {
	TargetRef      vpaTargetReference `json:"targetRef"`
	UpdatePolicy   *vpaUpdatePolicy   `json:"updatePolicy"`
	ResourcePolicy *vpaResourcePolicy `json:"resourcePolicy"`
}

type vpaCondition struct {
	Type               string      `json:"type"`
	Status             string      `json:"status"`
	Reason             string      `json:"reason"`
	Message            string      `json:"message"`
	LastTransitionTime metav1.Time `json:"lastTransitionTime"`
}

type vpaContainerRecommendation struct {
	ContainerName  string              `json:"containerName"`
	Target         corev1.ResourceList `json:"target"`
	LowerBound     corev1.ResourceList `json:"lowerBound"`
	UpperBound     corev1.ResourceList `json:"upperBound"`
	UncappedTarget corev1.ResourceList `json:"uncappedTarget"`
}

type vpaRecommendation struct {
	ContainerRecommendations []vpaContainerRecommendation `json:"containerRecommendations"`
}

type vpaStatus struct {
	Conditions     []vpaCondition     `json:"conditions"`
	Recommendation *vpaRecommendation `json:"recommendation"`
}

type vpaResource struct {
	Metadata metav1.ObjectMeta `json:"metadata"`
	Spec     vpaSpec           `json:"spec"`
	Status   vpaStatus         `json:"status"`
}

type vpaListResponse struct {
	Items []vpaResource `json:"items"`
}

type vpaClusterReadinessState struct {
	payload                  VPAClusterReadiness
	crdInstalled             bool
	recommenderReady         bool
	updaterReady             bool
	admissionControllerReady bool
	webhookConfigured        bool
	webhookEndpointReady     bool
	webhookTLSValid          bool
	updaterMinReplicas       int
}

type vpaTargetWorkloadState struct {
	kind                 string
	supported            bool
	found                bool
	desiredReplicas      int
	pods                 []corev1.Pod
	replicaSafetyApplies bool
}

type vpaAnalysisResult struct {
	status             string
	summary            string
	targetReplicaCount int
	matchedPodCount    int
	appliedPodCount    int
	insights           []VPAInsightItem
}

type ResourceValueItem struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type ResourceQuotaUsageItem struct {
	Resource     string  `json:"resource"`
	Used         string  `json:"used"`
	Hard         string  `json:"hard"`
	UsagePercent float64 `json:"usagePercent"`
	Status       string  `json:"status"`
}

type ResourceQuotaItem struct {
	Name                     string                              `json:"name"`
	Namespace                string                              `json:"namespace"`
	Status                   string                              `json:"status"`
	Summary                  string                              `json:"summary"`
	TrackedResourceCount     int                                 `json:"trackedResourceCount"`
	ExceededResourceCount    int                                 `json:"exceededResourceCount"`
	Usage                    jsonx.Slice[ResourceQuotaUsageItem] `json:"usage"`
	Scopes                   jsonx.Slice[string]                 `json:"scopes"`
	ScopeSelectorExpressions jsonx.Slice[string]                 `json:"scopeSelectorExpressions"`
	Labels                   jsonx.Slice[string]                 `json:"labels"`
	Age                      string                              `json:"age"`
	CreatedAt                string                              `json:"createdAt"`
}

type LimitRangeEntryItem struct {
	Type                 string              `json:"type"`
	Summary              string              `json:"summary"`
	Default              jsonx.Slice[string] `json:"default"`
	DefaultRequest       jsonx.Slice[string] `json:"defaultRequest"`
	Min                  jsonx.Slice[string] `json:"min"`
	Max                  jsonx.Slice[string] `json:"max"`
	MaxLimitRequestRatio jsonx.Slice[string] `json:"maxLimitRequestRatio"`
}

type LimitRangeItem struct {
	Name       string                           `json:"name"`
	Namespace  string                           `json:"namespace"`
	Status     string                           `json:"status"`
	Summary    string                           `json:"summary"`
	LimitCount int                              `json:"limitCount"`
	Types      jsonx.Slice[string]              `json:"types"`
	Limits     jsonx.Slice[LimitRangeEntryItem] `json:"limits"`
	Labels     jsonx.Slice[string]              `json:"labels"`
	Age        string                           `json:"age"`
	CreatedAt  string                           `json:"createdAt"`
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

func (s *ClusterService) DeleteResource(
	ctx context.Context,
	resourceName string,
	kind string,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)

	if namespace == "" {
		return WorkloadActionResult{}, newValidationError("%s namespace is required", strings.ToLower(kind))
	}
	if name == "" {
		return WorkloadActionResult{}, newValidationError("%s name is required", strings.ToLower(kind))
	}

	if _, err := s.runKubectlCommand(
		ctx,
		nil,
		"delete",
		resourceName,
		"-n",
		namespace,
		name,
		"--wait=false",
	); err != nil {
		return WorkloadActionResult{}, fmt.Errorf("delete %s %s/%s: %w", strings.ToLower(kind), namespace, name, err)
	}

	return WorkloadActionResult{
		Kind:      kind,
		Namespace: namespace,
		Name:      name,
		Operation: "delete",
		Message:   fmt.Sprintf("%s 删除请求已提交", kind),
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
	}, nil
}

func (s *ClusterService) DeleteClusterResource(
	ctx context.Context,
	resourceName string,
	kind string,
	name string,
) (WorkloadActionResult, error) {
	name = strings.TrimSpace(name)

	if name == "" {
		return WorkloadActionResult{}, newValidationError("%s name is required", strings.ToLower(kind))
	}

	if _, err := s.runKubectlCommand(
		ctx,
		nil,
		"delete",
		resourceName,
		name,
		"--wait=false",
	); err != nil {
		return WorkloadActionResult{}, fmt.Errorf("delete %s %s: %w", strings.ToLower(kind), name, err)
	}

	return WorkloadActionResult{
		Kind:      kind,
		Name:      name,
		Operation: "delete",
		Message:   fmt.Sprintf("%s 删除请求已提交", kind),
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

func (s *ClusterService) DeleteDeployment(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteResource(ctx, "deployment", "Deployment", namespace, name)
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

func (s *ClusterService) DeleteStatefulSet(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteResource(ctx, "statefulset", "StatefulSet", namespace, name)
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

func (s *ClusterService) DeleteDaemonSet(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteResource(ctx, "daemonset", "DaemonSet", namespace, name)
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

func (s *ClusterService) DeleteJob(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteResource(ctx, "job", "Job", namespace, name)
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

func (s *ClusterService) DeleteCronJob(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteResource(ctx, "cronjob", "CronJob", namespace, name)
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
		return WorkloadActionResult{}, newValidationError("%s namespace is required", strings.ToLower(kind))
	}
	if name == "" {
		return WorkloadActionResult{}, newValidationError("%s name is required", strings.ToLower(kind))
	}
	if content == "" {
		return WorkloadActionResult{}, newValidationError("yaml content is required")
	}

	var manifest resourceManifestIdentity
	if err := yaml.Unmarshal([]byte(content), &manifest); err != nil {
		return WorkloadActionResult{}, newValidationError("parse %s yaml: %v", strings.ToLower(kind), err)
	}

	if !strings.EqualFold(strings.TrimSpace(manifest.Kind), kind) {
		return WorkloadActionResult{}, newValidationError("yaml kind must be %s", kind)
	}
	if strings.TrimSpace(manifest.Metadata.Namespace) != namespace {
		return WorkloadActionResult{}, newValidationError("yaml namespace must be %s", namespace)
	}
	if strings.TrimSpace(manifest.Metadata.Name) != name {
		return WorkloadActionResult{}, newValidationError("yaml name must be %s", name)
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
		return WorkloadActionResult{}, newValidationError("%s name is required", strings.ToLower(kind))
	}
	if content == "" {
		return WorkloadActionResult{}, newValidationError("yaml content is required")
	}

	var manifest resourceManifestIdentity
	if err := yaml.Unmarshal([]byte(content), &manifest); err != nil {
		return WorkloadActionResult{}, newValidationError("parse %s yaml: %v", strings.ToLower(kind), err)
	}

	if !strings.EqualFold(strings.TrimSpace(manifest.Kind), kind) {
		return WorkloadActionResult{}, newValidationError("yaml kind must be %s", kind)
	}
	if strings.TrimSpace(manifest.Metadata.Name) != name {
		return WorkloadActionResult{}, newValidationError("yaml name must be %s", name)
	}
	if strings.TrimSpace(manifest.Metadata.Namespace) != "" {
		return WorkloadActionResult{}, newValidationError(
			"%s yaml must not set metadata.namespace",
			strings.ToLower(kind),
		)
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

func (s *ClusterService) CreateManifestYAML(
	ctx context.Context,
	content string,
) (WorkloadActionResult, error) {
	content = strings.TrimSpace(content)

	if content == "" {
		return WorkloadActionResult{}, newValidationError("yaml content is required")
	}
	if strings.Contains(content, "\n---") || strings.HasPrefix(content, "---\n") {
		return WorkloadActionResult{}, newValidationError("only a single manifest can be created at a time")
	}

	var manifest resourceManifestIdentity
	if err := yaml.Unmarshal([]byte(content), &manifest); err != nil {
		return WorkloadActionResult{}, newValidationError("parse manifest yaml: %v", err)
	}

	kind := strings.TrimSpace(manifest.Kind)
	apiVersion := strings.TrimSpace(manifest.APIVersion)
	name := strings.TrimSpace(manifest.Metadata.Name)
	namespace := strings.TrimSpace(manifest.Metadata.Namespace)

	if apiVersion == "" {
		return WorkloadActionResult{}, newValidationError("yaml apiVersion is required")
	}
	if kind == "" {
		return WorkloadActionResult{}, newValidationError("yaml kind is required")
	}
	if name == "" {
		return WorkloadActionResult{}, newValidationError("yaml metadata.name is required")
	}

	if _, err := s.runKubectlCommand(ctx, bytes.NewBufferString(content), "create", "-f", "-"); err != nil {
		if namespace != "" {
			return WorkloadActionResult{}, fmt.Errorf(
				"create %s %s/%s from yaml: %w",
				strings.ToLower(kind),
				namespace,
				name,
				err,
			)
		}

		return WorkloadActionResult{}, fmt.Errorf(
			"create %s %s from yaml: %w",
			strings.ToLower(kind),
			name,
			err,
		)
	}

	return WorkloadActionResult{
		Kind:      kind,
		Namespace: namespace,
		Name:      name,
		Operation: "create",
		Message:   fmt.Sprintf("%s 已创建", kind),
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

func (s *ClusterService) ListServiceAccounts(
	ctx context.Context,
	namespace string,
) ([]ServiceAccountItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.CoreV1().ServiceAccounts(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list serviceaccounts: %w", err)
	}

	pods, err := s.client.Kubernetes.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list pods for serviceaccounts: %w", err)
	}

	podsByAccount := podsByServiceAccount(pods.Items)
	accounts := make([]ServiceAccountItem, 0, len(items.Items))
	for _, item := range items.Items {
		referencedPods := podsByAccount[namespacedName(item.Namespace, item.Name)]
		accounts = append(accounts, ServiceAccountItem{
			Name:                 item.Name,
			Namespace:            item.Namespace,
			Status:               serviceAccountStatus(item),
			Summary:              serviceAccountSummary(item, len(referencedPods)),
			AutomountToken:       serviceAccountAutomountMode(item),
			SecretNames:          jsonx.Slice[string](serviceAccountSecretNames(item)),
			SecretCount:          len(item.Secrets),
			ImagePullSecrets:     jsonx.Slice[string](serviceAccountImagePullSecrets(item)),
			ImagePullSecretCount: len(item.ImagePullSecrets),
			ReferencedPodCount:   len(referencedPods),
			ReferencedPods:       jsonx.Slice[string](referencedPods),
			Labels:               jsonx.Slice[string](labelPairs(item.Labels)),
			Age:                  ageString(item.CreationTimestamp.Time),
			CreatedAt:            item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(accounts, func(i, j int) bool {
		leftOrder := topologyStatusOrder(accounts[i].Status)
		rightOrder := topologyStatusOrder(accounts[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if accounts[i].Namespace != accounts[j].Namespace {
			return accounts[i].Namespace < accounts[j].Namespace
		}
		return accounts[i].Name < accounts[j].Name
	})

	return accounts, nil
}

func (s *ClusterService) ListRoles(ctx context.Context, namespace string) ([]RoleItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.RbacV1().Roles(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list roles: %w", err)
	}

	roleBindings, err := s.client.Kubernetes.RbacV1().RoleBindings(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list rolebindings for roles: %w", err)
	}

	bindingsByRole := roleBindingsByRole(roleBindings.Items)
	roles := make([]RoleItem, 0, len(items.Items))
	for _, item := range items.Items {
		relatedBindings := bindingsByRole[namespacedName(item.Namespace, item.Name)]
		boundSubjects := roleBoundSubjects(relatedBindings)
		roles = append(roles, RoleItem{
			Name:              item.Name,
			Namespace:         item.Namespace,
			Status:            roleStatus(item),
			Summary:           roleSummary(item, len(boundSubjects)),
			RuleCount:         len(item.Rules),
			BoundSubjectCount: len(boundSubjects),
			BoundSubjects:     jsonx.Slice[string](boundSubjects),
			Rules:             jsonx.Slice[RoleRuleItem](roleRuleItems(item)),
			Labels:            jsonx.Slice[string](labelPairs(item.Labels)),
			Age:               ageString(item.CreationTimestamp.Time),
			CreatedAt:         item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(roles, func(i, j int) bool {
		leftOrder := topologyStatusOrder(roles[i].Status)
		rightOrder := topologyStatusOrder(roles[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if roles[i].Namespace != roles[j].Namespace {
			return roles[i].Namespace < roles[j].Namespace
		}
		return roles[i].Name < roles[j].Name
	})

	return roles, nil
}

func (s *ClusterService) ListRoleBindings(
	ctx context.Context,
	namespace string,
) ([]RoleBindingItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.RbacV1().RoleBindings(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list rolebindings: %w", err)
	}

	bindings := make([]RoleBindingItem, 0, len(items.Items))
	for _, item := range items.Items {
		subjects := roleBindingSubjectItems(item)
		subjectSummaries := roleBindingSubjectSummaries(item)
		bindings = append(bindings, RoleBindingItem{
			Name:             item.Name,
			Namespace:        item.Namespace,
			Status:           roleBindingStatus(item),
			Summary:          roleBindingSummary(item),
			RoleRefKind:      item.RoleRef.Kind,
			RoleRefName:      item.RoleRef.Name,
			RoleRefAPIGroup:  item.RoleRef.APIGroup,
			SubjectCount:     len(subjects),
			SubjectSummaries: jsonx.Slice[string](subjectSummaries),
			Subjects:         jsonx.Slice[RoleBindingSubjectItem](subjects),
			Labels:           jsonx.Slice[string](labelPairs(item.Labels)),
			Age:              ageString(item.CreationTimestamp.Time),
			CreatedAt:        item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(bindings, func(i, j int) bool {
		leftOrder := topologyStatusOrder(bindings[i].Status)
		rightOrder := topologyStatusOrder(bindings[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if bindings[i].Namespace != bindings[j].Namespace {
			return bindings[i].Namespace < bindings[j].Namespace
		}
		return bindings[i].Name < bindings[j].Name
	})

	return bindings, nil
}

func (s *ClusterService) ListConfigMaps(ctx context.Context, namespace string) ([]ConfigMapItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.CoreV1().ConfigMaps(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list configmaps: %w", err)
	}

	pods, err := s.client.Kubernetes.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list pods for configmaps: %w", err)
	}

	podsByReference := podsByConfigMapReference(pods.Items)
	configMaps := make([]ConfigMapItem, 0, len(items.Items))
	for _, item := range items.Items {
		referencedPods := podsByReference[namespacedName(item.Namespace, item.Name)]
		configMaps = append(configMaps, ConfigMapItem{
			Name:               item.Name,
			Namespace:          item.Namespace,
			Status:             configMapStatus(item),
			Summary:            configMapSummary(item, len(referencedPods)),
			Immutable:          item.Immutable != nil && *item.Immutable,
			DataKeys:           jsonx.Slice[string](configMapDataKeys(item)),
			BinaryDataKeys:     jsonx.Slice[string](configMapBinaryDataKeys(item)),
			DataCount:          len(item.Data),
			BinaryDataCount:    len(item.BinaryData),
			ReferencedPodCount: len(referencedPods),
			ReferencedPods:     jsonx.Slice[string](referencedPods),
			Labels:             jsonx.Slice[string](labelPairs(item.Labels)),
			Age:                ageString(item.CreationTimestamp.Time),
			CreatedAt:          item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(configMaps, func(i, j int) bool {
		leftOrder := topologyStatusOrder(configMaps[i].Status)
		rightOrder := topologyStatusOrder(configMaps[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if configMaps[i].Namespace != configMaps[j].Namespace {
			return configMaps[i].Namespace < configMaps[j].Namespace
		}
		return configMaps[i].Name < configMaps[j].Name
	})

	return configMaps, nil
}

func (s *ClusterService) ListSecrets(ctx context.Context, namespace string) ([]SecretItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.CoreV1().Secrets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list secrets: %w", err)
	}

	pods, err := s.client.Kubernetes.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list pods for secrets: %w", err)
	}

	podsByReference := podsBySecretReference(pods.Items)
	secrets := make([]SecretItem, 0, len(items.Items))
	for _, item := range items.Items {
		referencedPods := podsByReference[namespacedName(item.Namespace, item.Name)]
		secrets = append(secrets, SecretItem{
			Name:               item.Name,
			Namespace:          item.Namespace,
			Status:             secretStatus(item),
			Type:               secretType(item),
			Summary:            secretSummary(item, len(referencedPods)),
			Immutable:          item.Immutable != nil && *item.Immutable,
			DataKeys:           jsonx.Slice[string](secretDataKeys(item)),
			DataCount:          len(item.Data),
			ReferencedPodCount: len(referencedPods),
			ReferencedPods:     jsonx.Slice[string](referencedPods),
			Labels:             jsonx.Slice[string](labelPairs(item.Labels)),
			Age:                ageString(item.CreationTimestamp.Time),
			CreatedAt:          item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(secrets, func(i, j int) bool {
		leftOrder := topologyStatusOrder(secrets[i].Status)
		rightOrder := topologyStatusOrder(secrets[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if secrets[i].Namespace != secrets[j].Namespace {
			return secrets[i].Namespace < secrets[j].Namespace
		}
		return secrets[i].Name < secrets[j].Name
	})

	return secrets, nil
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

func (s *ClusterService) ListHPAs(ctx context.Context, namespace string) ([]HPAItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.AutoscalingV2().HorizontalPodAutoscalers(namespace).List(
		ctx,
		metav1.ListOptions{},
	)
	if err != nil {
		return nil, fmt.Errorf("list hpas: %w", err)
	}

	hpas := make([]HPAItem, 0, len(items.Items))
	for _, item := range items.Items {
		hpas = append(hpas, HPAItem{
			Name:                  item.Name,
			Namespace:             item.Namespace,
			Status:                hpaStatus(item),
			Summary:               hpaSummary(item),
			ScaleTargetKind:       item.Spec.ScaleTargetRef.Kind,
			ScaleTargetName:       item.Spec.ScaleTargetRef.Name,
			ScaleTargetAPIVersion: item.Spec.ScaleTargetRef.APIVersion,
			MinReplicas:           hpaMinReplicas(item),
			MaxReplicas:           item.Spec.MaxReplicas,
			CurrentReplicas:       item.Status.CurrentReplicas,
			DesiredReplicas:       item.Status.DesiredReplicas,
			MetricCount:           len(item.Spec.Metrics),
			Metrics:               jsonx.Slice[HPAMetricItem](hpaMetricItems(item)),
			ConditionCount:        len(item.Status.Conditions),
			Conditions:            jsonx.Slice[HPAConditionItem](hpaConditionItems(item)),
			BehaviorSummary:       hpaBehaviorSummary(item),
			Labels:                jsonx.Slice[string](labelPairs(item.Labels)),
			Age:                   ageString(item.CreationTimestamp.Time),
			CreatedAt:             item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
			LastScaleTime:         hpaLastScaleTime(item),
		})
	}

	sort.Slice(hpas, func(i, j int) bool {
		leftOrder := topologyStatusOrder(hpas[i].Status)
		rightOrder := topologyStatusOrder(hpas[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if hpas[i].Namespace != hpas[j].Namespace {
			return hpas[i].Namespace < hpas[j].Namespace
		}
		return hpas[i].Name < hpas[j].Name
	})

	return hpas, nil
}

func (s *ClusterService) ListVPAs(ctx context.Context, namespace string) ([]VPAItem, error) {
	namespace = normalizeNamespace(namespace)

	args := []string{"get", "verticalpodautoscalers.autoscaling.k8s.io"}
	if namespace == "" {
		args = append(args, "-A")
	} else {
		args = append(args, "-n", namespace)
	}
	args = append(args, "-o", "json")

	output, err := s.runKubectlCommand(ctx, nil, args...)
	if err != nil {
		if isKubectlMissingResourceError(err) {
			return []VPAItem{}, nil
		}
		return nil, fmt.Errorf("list vpas: %w", err)
	}

	var list vpaListResponse
	if err := json.Unmarshal(output, &list); err != nil {
		return nil, fmt.Errorf("decode vpas: %w", err)
	}

	readiness := s.collectVPAClusterReadiness(ctx)
	vpas := make([]VPAItem, 0, len(list.Items))
	for _, item := range list.Items {
		policies := vpaResourcePolicies(item)
		recommendations := vpaRecommendations(item)
		conditions := vpaConditions(item)
		analysis := s.analyzeVPAItem(ctx, item, recommendations, readiness)
		vpas = append(vpas, VPAItem{
			Name:                  item.Metadata.Name,
			Namespace:             item.Metadata.Namespace,
			Status:                vpaStatusValue(item, recommendations),
			Summary:               vpaSummary(item, recommendations),
			ScaleTargetKind:       item.Spec.TargetRef.Kind,
			ScaleTargetName:       item.Spec.TargetRef.Name,
			ScaleTargetAPIVersion: item.Spec.TargetRef.APIVersion,
			UpdateMode:            vpaUpdateMode(item),
			EffectivenessStatus:   analysis.status,
			EffectivenessSummary:  analysis.summary,
			TargetReplicaCount:    analysis.targetReplicaCount,
			MatchedPodCount:       analysis.matchedPodCount,
			AppliedPodCount:       analysis.appliedPodCount,
			ContainerPolicyCount:  len(policies),
			RecommendationCount:   len(recommendations),
			ConditionCount:        len(conditions),
			ResourcePolicies:      jsonx.Slice[VPAContainerPolicyItem](policies),
			Recommendations:       jsonx.Slice[VPARecommendationItem](recommendations),
			Conditions:            jsonx.Slice[VPAConditionItem](conditions),
			Insights:              jsonx.Slice[VPAInsightItem](analysis.insights),
			Labels:                jsonx.Slice[string](labelPairs(item.Metadata.Labels)),
			Age:                   ageString(item.Metadata.CreationTimestamp.Time),
			CreatedAt:             item.Metadata.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(vpas, func(i, j int) bool {
		leftOrder := topologyStatusOrder(vpas[i].Status)
		rightOrder := topologyStatusOrder(vpas[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if vpas[i].Namespace != vpas[j].Namespace {
			return vpas[i].Namespace < vpas[j].Namespace
		}
		return vpas[i].Name < vpas[j].Name
	})

	return vpas, nil
}

func (s *ClusterService) GetVPAClusterReadiness(ctx context.Context) (VPAClusterReadiness, error) {
	return s.collectVPAClusterReadiness(ctx).payload, nil
}

func (s *ClusterService) collectVPAClusterReadiness(ctx context.Context) vpaClusterReadinessState {
	state := vpaClusterReadinessState{
		updaterMinReplicas: 2,
	}
	checks := make([]VPAClusterReadinessCheck, 0, 7)

	addCheck := func(key string, label string, status string, summary string, detail string) {
		checks = append(checks, VPAClusterReadinessCheck{
			Key:     key,
			Label:   label,
			Status:  status,
			Summary: summary,
			Detail:  detail,
		})
	}

	if _, err := s.runKubectlCommand(ctx, nil, "get", "crd", "verticalpodautoscalers.autoscaling.k8s.io", "-o", "json"); err != nil {
		switch {
		case isKubectlNotFoundError(err):
			addCheck("crd", "VPA CRD", TopologyStatusError, "VerticalPodAutoscaler CRD is missing", "Install the autoscaling.k8s.io VPA CRDs before using this feature.")
		case isKubectlForbiddenError(err):
			addCheck("crd", "VPA CRD", TopologyStatusWarning, "No permission to inspect the VPA CRD", "Grant cluster-scope access to read CustomResourceDefinitions.")
		default:
			addCheck("crd", "VPA CRD", TopologyStatusWarning, "Unable to verify the VPA CRD", err.Error())
		}
	} else {
		state.crdInstalled = true
		addCheck("crd", "VPA CRD", TopologyStatusHealthy, "CRD is installed", "")
	}

	recommender, err := s.client.Kubernetes.AppsV1().Deployments("kube-system").Get(ctx, "vpa-recommender", metav1.GetOptions{})
	switch {
	case apierrors.IsNotFound(err):
		addCheck("recommender", "Recommender", TopologyStatusError, "vpa-recommender deployment is missing", "Recommendations cannot be generated until the recommender controller is installed.")
	case apierrors.IsForbidden(err):
		addCheck("recommender", "Recommender", TopologyStatusWarning, "No permission to inspect vpa-recommender", "Grant access to kube-system deployments for readiness diagnostics.")
	case err != nil:
		addCheck("recommender", "Recommender", TopologyStatusWarning, "Unable to inspect vpa-recommender", err.Error())
	default:
		status, summary := workloadReadinessSummary(recommender.Status.ReadyReplicas, desiredReplicas(recommender.Spec.Replicas))
		state.recommenderReady = status == TopologyStatusHealthy
		addCheck("recommender", "Recommender", status, summary, "")
	}

	updater, err := s.client.Kubernetes.AppsV1().Deployments("kube-system").Get(ctx, "vpa-updater", metav1.GetOptions{})
	switch {
	case apierrors.IsNotFound(err):
		addCheck("updater", "Updater", TopologyStatusError, "vpa-updater deployment is missing", "Auto / Recreate update modes cannot recycle pods without the updater controller.")
	case apierrors.IsForbidden(err):
		addCheck("updater", "Updater", TopologyStatusWarning, "No permission to inspect vpa-updater", "Grant access to kube-system deployments for readiness diagnostics.")
	case err != nil:
		addCheck("updater", "Updater", TopologyStatusWarning, "Unable to inspect vpa-updater", err.Error())
	default:
		state.updaterMinReplicas = deploymentArgInt(updater, "--min-replicas", 2)
		status, summary := workloadReadinessSummary(updater.Status.ReadyReplicas, desiredReplicas(updater.Spec.Replicas))
		state.updaterReady = status == TopologyStatusHealthy
		addCheck("updater", "Updater", status, fmt.Sprintf("%s · min replicas %d", summary, state.updaterMinReplicas), "")
		if state.updaterMinReplicas > 1 {
			addCheck(
				"updater-min-replicas",
				"Updater Policy",
				TopologyStatusHealthy,
				fmt.Sprintf("Auto updates protect workloads below %d replicas", state.updaterMinReplicas),
				"Single-replica workloads will not be auto-evicted until they are recreated or scaled above the updater threshold.",
			)
		}
	}

	admissionController, err := s.client.Kubernetes.AppsV1().Deployments("kube-system").Get(ctx, "vpa-admission-controller", metav1.GetOptions{})
	switch {
	case apierrors.IsNotFound(err):
		addCheck("admission-controller", "Admission Controller", TopologyStatusError, "vpa-admission-controller deployment is missing", "New pods will not receive VPA-mutated resource requests or limits.")
	case apierrors.IsForbidden(err):
		addCheck("admission-controller", "Admission Controller", TopologyStatusWarning, "No permission to inspect vpa-admission-controller", "Grant access to kube-system deployments for readiness diagnostics.")
	case err != nil:
		addCheck("admission-controller", "Admission Controller", TopologyStatusWarning, "Unable to inspect vpa-admission-controller", err.Error())
	default:
		status, summary := workloadReadinessSummary(admissionController.Status.ReadyReplicas, desiredReplicas(admissionController.Spec.Replicas))
		state.admissionControllerReady = status == TopologyStatusHealthy
		addCheck("admission-controller", "Admission Controller", status, summary, "")
	}

	webhook, webhookStatus, webhookSummary, webhookDetail := s.inspectVPAWebhookConfiguration(ctx)
	state.webhookConfigured = webhook != nil && webhookStatus == TopologyStatusHealthy
	addCheck("webhook", "Webhook Configuration", webhookStatus, webhookSummary, webhookDetail)

	endpointStatus, endpointSummary, endpointDetail := s.inspectVPAWebhookEndpoints(ctx)
	state.webhookEndpointReady = endpointStatus == TopologyStatusHealthy
	addCheck("webhook-endpoints", "Webhook Endpoints", endpointStatus, endpointSummary, endpointDetail)

	tlsStatus, tlsSummary, tlsDetail := s.inspectVPAWebhookTLS(ctx, webhook)
	state.webhookTLSValid = tlsStatus == TopologyStatusHealthy
	addCheck("webhook-tls", "Webhook TLS", tlsStatus, tlsSummary, tlsDetail)

	state.payload = VPAClusterReadiness{
		Status:             readinessOverallStatus(checks),
		Summary:            readinessSummary(checks),
		UpdaterMinReplicas: state.updaterMinReplicas,
		Checks:             jsonx.Slice[VPAClusterReadinessCheck](checks),
	}

	return state
}

func workloadReadinessSummary(readyReplicas int32, desired int32) (string, string) {
	if desired <= 0 {
		if readyReplicas > 0 {
			return TopologyStatusHealthy, fmt.Sprintf("%d ready", readyReplicas)
		}
		return TopologyStatusWarning, "No ready replicas"
	}

	if readyReplicas >= desired {
		return TopologyStatusHealthy, fmt.Sprintf("%d/%d ready", readyReplicas, desired)
	}

	if readyReplicas > 0 {
		return TopologyStatusWarning, fmt.Sprintf("%d/%d ready", readyReplicas, desired)
	}

	return TopologyStatusError, fmt.Sprintf("%d/%d ready", readyReplicas, desired)
}

func deploymentArgInt(item *appsv1.Deployment, name string, fallback int) int {
	if item == nil || len(item.Spec.Template.Spec.Containers) == 0 {
		return fallback
	}

	for _, container := range item.Spec.Template.Spec.Containers {
		for index, arg := range container.Args {
			if arg == name && index+1 < len(container.Args) {
				if value, err := strconv.Atoi(strings.TrimSpace(container.Args[index+1])); err == nil {
					return value
				}
			}
			if strings.HasPrefix(arg, name+"=") {
				if value, err := strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(arg, name+"="))); err == nil {
					return value
				}
			}
		}
	}

	return fallback
}

func (s *ClusterService) inspectVPAWebhookConfiguration(
	ctx context.Context,
) (*admissionregistrationv1.MutatingWebhook, string, string, string) {
	config, err := s.client.Kubernetes.AdmissionregistrationV1().MutatingWebhookConfigurations().Get(
		ctx,
		"vpa-webhook-config",
		metav1.GetOptions{},
	)
	switch {
	case apierrors.IsNotFound(err):
		return nil, TopologyStatusError, "vpa-webhook-config is missing", "Without the mutating webhook configuration, new pods will not receive VPA updates."
	case apierrors.IsForbidden(err):
		return nil, TopologyStatusWarning, "No permission to inspect vpa-webhook-config", "Grant cluster-scope access to mutating webhook configurations for readiness diagnostics."
	case err != nil:
		return nil, TopologyStatusWarning, "Unable to inspect vpa-webhook-config", err.Error()
	}

	webhook := vpaPodMutationWebhook(config)
	if webhook == nil {
		return nil, TopologyStatusError, "No pod CREATE rule found in vpa-webhook-config", "The VPA webhook must target pod CREATE requests to mutate new pods."
	}

	service := webhook.ClientConfig.Service
	if service == nil || strings.TrimSpace(service.Name) == "" || strings.TrimSpace(service.Namespace) == "" {
		return webhook, TopologyStatusError, "Webhook service reference is incomplete", "Expected a service target such as vpa-webhook.kube-system.svc."
	}

	return webhook, TopologyStatusHealthy, fmt.Sprintf("Webhook routes to %s/%s", service.Namespace, service.Name), ""
}

func vpaPodMutationWebhook(
	config *admissionregistrationv1.MutatingWebhookConfiguration,
) *admissionregistrationv1.MutatingWebhook {
	if config == nil {
		return nil
	}

	for index := range config.Webhooks {
		webhook := &config.Webhooks[index]
		for _, rule := range webhook.Rules {
			if !containsAdmissionResource(rule.Resources, "pods") || !containsAdmissionOperation(rule.Operations, "CREATE") {
				continue
			}
			return webhook
		}
	}

	return nil
}

func containsAdmissionResource(items []string, expected string) bool {
	for _, item := range items {
		value := strings.ToLower(strings.TrimSpace(item))
		if value == "*" || value == expected {
			return true
		}
	}
	return false
}

func containsAdmissionOperation(items []admissionregistrationv1.OperationType, expected string) bool {
	for _, item := range items {
		value := strings.ToUpper(strings.TrimSpace(string(item)))
		if value == "*" || value == expected {
			return true
		}
	}
	return false
}

func (s *ClusterService) inspectVPAWebhookEndpoints(ctx context.Context) (string, string, string) {
	service, err := s.client.Kubernetes.CoreV1().Services("kube-system").Get(ctx, "vpa-webhook", metav1.GetOptions{})
	switch {
	case apierrors.IsNotFound(err):
		return TopologyStatusError, "Service kube-system/vpa-webhook is missing", "The mutating webhook has no stable in-cluster endpoint."
	case apierrors.IsForbidden(err):
		return TopologyStatusWarning, "No permission to inspect service kube-system/vpa-webhook", "Grant access to kube-system services and endpoints for readiness diagnostics."
	case err != nil:
		return TopologyStatusWarning, "Unable to inspect service kube-system/vpa-webhook", err.Error()
	}

	endpoints, err := s.client.Kubernetes.CoreV1().Endpoints("kube-system").Get(ctx, "vpa-webhook", metav1.GetOptions{})
	switch {
	case apierrors.IsNotFound(err):
		return TopologyStatusError, "Endpoint kube-system/vpa-webhook is missing", "The webhook service has no backing pod endpoint."
	case apierrors.IsForbidden(err):
		return TopologyStatusWarning, "No permission to inspect endpoint kube-system/vpa-webhook", "Grant access to kube-system services and endpoints for readiness diagnostics."
	case err != nil:
		return TopologyStatusWarning, "Unable to inspect endpoint kube-system/vpa-webhook", err.Error()
	}

	readyAddresses := 0
	for _, subset := range endpoints.Subsets {
		readyAddresses += len(subset.Addresses)
	}
	if readyAddresses == 0 {
		return TopologyStatusError, fmt.Sprintf("Service %s/%s has no ready endpoints", service.Namespace, service.Name), "The admission webhook cannot serve pod CREATE requests until a ready endpoint is available."
	}

	return TopologyStatusHealthy, fmt.Sprintf("%d ready endpoint(s)", readyAddresses), ""
}

func (s *ClusterService) inspectVPAWebhookTLS(
	ctx context.Context,
	webhook *admissionregistrationv1.MutatingWebhook,
) (string, string, string) {
	if webhook == nil || webhook.ClientConfig.Service == nil {
		return TopologyStatusWarning, "Skipping TLS validation until webhook configuration is readable", ""
	}

	secret, err := s.client.Kubernetes.CoreV1().Secrets("kube-system").Get(ctx, "vpa-tls-certs", metav1.GetOptions{})
	switch {
	case apierrors.IsNotFound(err):
		return TopologyStatusError, "Secret kube-system/vpa-tls-certs is missing", "The admission webhook cannot present a server certificate without this secret."
	case apierrors.IsForbidden(err):
		return TopologyStatusWarning, "No permission to inspect secret kube-system/vpa-tls-certs", "Grant access to kube-system secrets for readiness diagnostics."
	case err != nil:
		return TopologyStatusWarning, "Unable to inspect secret kube-system/vpa-tls-certs", err.Error()
	}

	caData := secret.Data["caCert.pem"]
	serverData := secret.Data["serverCert.pem"]
	if len(caData) == 0 || len(serverData) == 0 {
		return TopologyStatusError, "Webhook TLS secret is incomplete", "Expected both caCert.pem and serverCert.pem in kube-system/vpa-tls-certs."
	}

	if len(webhook.ClientConfig.CABundle) == 0 {
		return TopologyStatusError, "Webhook configuration is missing caBundle", "kube-apiserver cannot verify the webhook server certificate without the embedded CA bundle."
	}
	if !bytes.Equal(webhook.ClientConfig.CABundle, caData) {
		return TopologyStatusError, "Webhook caBundle does not match the mounted CA certificate", "Refresh the mutating webhook configuration after rotating webhook certificates."
	}

	caCert, err := parsePEMCertificate(caData)
	if err != nil {
		return TopologyStatusError, "Unable to parse webhook CA certificate", err.Error()
	}
	if !caCert.IsCA {
		return TopologyStatusError, "Webhook CA certificate is not marked as a CA", "Regenerate the CA certificate with basicConstraints CA:TRUE and keyCertSign usage."
	}

	serverCert, err := parsePEMCertificate(serverData)
	if err != nil {
		return TopologyStatusError, "Unable to parse webhook server certificate", err.Error()
	}

	dnsName := fmt.Sprintf("%s.%s.svc", webhook.ClientConfig.Service.Name, webhook.ClientConfig.Service.Namespace)
	roots := x509.NewCertPool()
	roots.AddCert(caCert)
	if _, err := serverCert.Verify(x509.VerifyOptions{
		DNSName: dnsName,
		Roots:   roots,
		KeyUsages: []x509.ExtKeyUsage{
			x509.ExtKeyUsageServerAuth,
		},
	}); err != nil {
		return TopologyStatusError, "Webhook certificate verification failed", err.Error()
	}

	return TopologyStatusHealthy, fmt.Sprintf("Server certificate verifies for %s", dnsName), ""
}

func parsePEMCertificate(data []byte) (*x509.Certificate, error) {
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, fmt.Errorf("no PEM certificate block found")
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse x509 certificate: %w", err)
	}

	return cert, nil
}

func readinessOverallStatus(checks []VPAClusterReadinessCheck) string {
	status := TopologyStatusHealthy
	for _, check := range checks {
		if check.Status == TopologyStatusError {
			return TopologyStatusError
		}
		if check.Status == TopologyStatusWarning {
			status = TopologyStatusWarning
		}
	}

	return status
}

func readinessSummary(checks []VPAClusterReadinessCheck) string {
	for _, check := range checks {
		if check.Status == TopologyStatusError {
			return check.Summary
		}
	}
	for _, check := range checks {
		if check.Status == TopologyStatusWarning {
			return check.Summary
		}
	}
	return "VPA controllers and webhook are ready"
}

func (s *ClusterService) analyzeVPAItem(
	ctx context.Context,
	item vpaResource,
	recommendations []VPARecommendationItem,
	readiness vpaClusterReadinessState,
) vpaAnalysisResult {
	mode := strings.ToLower(vpaUpdateMode(item))
	autoApply := vpaModeAutoApplies(mode)
	targetState, targetErr := s.inspectVPATarget(ctx, item)
	conditions := vpaConditionIndex(item)
	insights := make([]VPAInsightItem, 0, 8)
	seen := make(map[string]struct{})

	addInsight := func(level string, code string, summary string, detail string) {
		if _, ok := seen[code]; ok {
			return
		}
		seen[code] = struct{}{}
		insights = append(insights, VPAInsightItem{
			Level:   level,
			Code:    code,
			Summary: summary,
			Detail:  detail,
		})
	}

	if targetErr != nil {
		addInsight("error", "TARGET_LOOKUP_FAILED", "Unable to inspect the target workload", targetErr.Error())
	}
	if !targetState.supported {
		addInsight("warning", "TARGET_KIND_UNSUPPORTED", "This target kind does not yet expose rollout diagnostics", "VPA recommendations still work, but the UI cannot explain apply progress for this target kind yet.")
	}
	if targetState.supported && !targetState.found {
		addInsight("error", "TARGET_NOT_FOUND", "The referenced target workload was not found", fmt.Sprintf("%s %s/%s no longer exists.", item.Spec.TargetRef.Kind, item.Metadata.Namespace, item.Spec.TargetRef.Name))
	}

	if !readiness.crdInstalled {
		addInsight("error", "CRD_MISSING", "The cluster does not have the VPA CRD installed", "Install the VPA CRDs before using this feature.")
	}
	if !readiness.recommenderReady {
		addInsight("error", "RECOMMENDER_UNAVAILABLE", "The recommender is not ready", "VPA cannot produce fresh container recommendations until vpa-recommender is healthy.")
	}
	if autoApply && !readiness.updaterReady {
		addInsight("error", "UPDATER_UNAVAILABLE", "The updater is not ready", "Auto / Recreate modes cannot recycle pods until vpa-updater is healthy.")
	}
	if autoApply && (!readiness.admissionControllerReady || !readiness.webhookConfigured || !readiness.webhookEndpointReady || !readiness.webhookTLSValid) {
		addInsight("error", "ADMISSION_UNAVAILABLE", "The admission webhook is not ready", "New pods will keep their original requests and limits until the VPA admission chain is healthy.")
	}

	if condition, ok := conditions["configunsupported"]; ok && condition.status {
		addInsight("error", "CONFIG_UNSUPPORTED", "The VPA configuration is not supported", firstNonEmpty(condition.message, condition.reason))
	}
	if condition, ok := conditions["nopodsmatched"]; ok && condition.status {
		addInsight("warning", "NO_PODS_MATCHED", "No pods currently match the target selector", firstNonEmpty(condition.message, condition.reason))
	}
	if condition, ok := conditions["fetchinghistory"]; ok && condition.status {
		addInsight("warning", "FETCHING_HISTORY", "The recommender is still building history", firstNonEmpty(condition.message, condition.reason))
	}
	if condition, ok := conditions["lowconfidence"]; ok && condition.status {
		addInsight("warning", "LOW_CONFIDENCE", "Recommendation confidence is still low", firstNonEmpty(condition.message, condition.reason))
	}
	if condition, ok := conditions["recommendationprovided"]; ok && !condition.status {
		addInsight("warning", "RECOMMENDATION_PENDING", "Recommendations are not ready yet", firstNonEmpty(condition.message, condition.reason))
	}

	if len(recommendations) == 0 {
		addInsight("warning", "NO_RECOMMENDATION_DATA", "No container recommendations are available yet", "Wait for traffic and metrics history, or verify that the recommender can read workload samples.")
	}

	switch mode {
	case "off":
		addInsight("warning", "UPDATE_MODE_OFF", "Update mode is Off", "This VPA only computes recommendations and will not change running or newly created pods automatically.")
	case "initial":
		addInsight("warning", "UPDATE_MODE_INITIAL", "Update mode is Initial", "Only pods created after the recommendation is ready will receive VPA mutations.")
	case "default":
		addInsight("info", "UPDATE_MODE_DEFAULT", "Update mode relies on the cluster default", "The actual rollout behavior depends on the VPA controller version and cluster defaults.")
	}

	activePods := activePodsOnly(targetState.pods)
	appliedPods := 0
	firstUpdateDetail := ""
	for _, pod := range activePods {
		if note, ok := podVPAUpdateDetail(pod); ok {
			appliedPods++
			if firstUpdateDetail == "" {
				firstUpdateDetail = note
			}
		}
	}

	if firstUpdateDetail != "" {
		addInsight("info", "POD_UPDATES_RECORDED", "At least one active pod reports VPA mutations", firstUpdateDetail)
		if strings.Contains(strings.ToLower(firstUpdateDetail), "capped") {
			addInsight("warning", "RECOMMENDATION_CAPPED", "The applied resource change was capped by policy or namespace limits", firstUpdateDetail)
		}
	} else if autoApply && len(recommendations) > 0 && len(activePods) > 0 {
		if targetState.replicaSafetyApplies && targetState.desiredReplicas > 0 && targetState.desiredReplicas < readiness.updaterMinReplicas && readiness.updaterReady {
			addInsight(
				"warning",
				"LOW_REPLICA_PROTECTION",
				fmt.Sprintf("Auto updates wait below %d replicas", readiness.updaterMinReplicas),
				"Scale the workload above the updater threshold or recreate the pod manually to pick up the recommendation.",
			)
		} else {
			addInsight("warning", "WAITING_FOR_RECREATE", "Recommendations exist, but no active pod shows VPA updates yet", "The workload is still waiting for pod recreation or a fresh rollout.")
		}
	}

	if vpaRecommendationCapped(recommendations) {
		addInsight("warning", "TARGET_CAPPED", "The target recommendation differs from the uncapped recommendation", "A container policy, LimitRange, or VPA maxAllowed rule is constraining the final target.")
	}

	result := vpaAnalysisResult{
		status:             TopologyStatusWarning,
		summary:            "Waiting for rollout progress",
		targetReplicaCount: targetState.desiredReplicas,
		matchedPodCount:    len(activePods),
		appliedPodCount:    appliedPods,
		insights:           insights,
	}

	switch {
	case targetState.supported && !targetState.found:
		result.status = TopologyStatusError
		result.summary = "Target workload not found"
	case len(activePods) == 0:
		result.status = TopologyStatusWarning
		result.summary = "No active pods matched the target"
	case appliedPods > 0 && appliedPods == len(activePods):
		result.status = TopologyStatusHealthy
		result.summary = fmt.Sprintf("%d/%d active pod(s) report VPA updates", appliedPods, len(activePods))
	case appliedPods > 0:
		result.status = TopologyStatusWarning
		result.summary = fmt.Sprintf("%d/%d active pod(s) report VPA updates", appliedPods, len(activePods))
	case mode == "off":
		result.status = TopologyStatusWarning
		result.summary = "Recommendation-only mode"
	case mode == "initial":
		result.status = TopologyStatusWarning
		result.summary = "Applies to newly created pods only"
	case len(recommendations) == 0:
		result.status = TopologyStatusWarning
		result.summary = "Waiting for recommendation data"
	case autoApply && !readiness.webhookTLSValid:
		result.status = TopologyStatusError
		result.summary = "Admission webhook is not healthy"
	case autoApply && targetState.replicaSafetyApplies && targetState.desiredReplicas > 0 && targetState.desiredReplicas < readiness.updaterMinReplicas && readiness.updaterReady:
		result.status = TopologyStatusWarning
		result.summary = fmt.Sprintf("Updater protects workloads below %d replicas", readiness.updaterMinReplicas)
	default:
		result.status = TopologyStatusWarning
		result.summary = "Waiting for pod recreation to apply the recommendation"
	}

	return result
}

func vpaModeAutoApplies(mode string) bool {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "auto", "recreate", "inplaceorrecreate":
		return true
	default:
		return false
	}
}

type vpaConditionState struct {
	status  bool
	reason  string
	message string
}

func vpaConditionIndex(item vpaResource) map[string]vpaConditionState {
	result := make(map[string]vpaConditionState, len(item.Status.Conditions))
	for _, condition := range item.Status.Conditions {
		result[strings.ToLower(strings.TrimSpace(condition.Type))] = vpaConditionState{
			status:  strings.EqualFold(condition.Status, "true"),
			reason:  strings.TrimSpace(condition.Reason),
			message: strings.TrimSpace(condition.Message),
		}
	}
	return result
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func activePodsOnly(items []corev1.Pod) []corev1.Pod {
	if len(items) == 0 {
		return nil
	}

	result := make([]corev1.Pod, 0, len(items))
	for _, item := range items {
		if item.DeletionTimestamp != nil {
			continue
		}
		switch item.Status.Phase {
		case corev1.PodFailed, corev1.PodSucceeded:
			continue
		}
		result = append(result, item)
	}
	return result
}

func podVPAUpdateDetail(item corev1.Pod) (string, bool) {
	if value := strings.TrimSpace(item.Annotations["vpaUpdates"]); value != "" {
		return value, true
	}
	if value := strings.TrimSpace(item.Annotations["vpaObservedContainers"]); value != "" {
		return "Observed containers: " + value, true
	}
	return "", false
}

func vpaRecommendationCapped(items []VPARecommendationItem) bool {
	for _, item := range items {
		if resourceStringSetsEqual(item.Target, item.UncappedTarget) {
			continue
		}
		if len(item.Target) > 0 && len(item.UncappedTarget) > 0 {
			return true
		}
	}
	return false
}

func resourceStringSetsEqual(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}

	leftCopy := append([]string(nil), left...)
	rightCopy := append([]string(nil), right...)
	sort.Strings(leftCopy)
	sort.Strings(rightCopy)
	for index := range leftCopy {
		if leftCopy[index] != rightCopy[index] {
			return false
		}
	}
	return true
}

func (s *ClusterService) inspectVPATarget(ctx context.Context, item vpaResource) (vpaTargetWorkloadState, error) {
	target := vpaTargetWorkloadState{
		kind: strings.TrimSpace(item.Spec.TargetRef.Kind),
	}

	namespace := item.Metadata.Namespace
	name := strings.TrimSpace(item.Spec.TargetRef.Name)
	if namespace == "" || target.kind == "" || name == "" {
		return target, nil
	}

	pods, err := s.client.Kubernetes.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return target, fmt.Errorf("list pods for VPA target %s/%s: %w", namespace, name, err)
	}

	switch strings.ToLower(target.kind) {
	case "deployment":
		workload, err := s.client.Kubernetes.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
		if apierrors.IsNotFound(err) {
			target.supported = true
			return target, nil
		}
		if err != nil {
			return target, fmt.Errorf("get deployment %s/%s: %w", namespace, name, err)
		}
		selector, err := metav1.LabelSelectorAsSelector(workload.Spec.Selector)
		if err != nil {
			return target, fmt.Errorf("build deployment selector %s/%s: %w", namespace, name, err)
		}
		target.supported = true
		target.found = true
		target.desiredReplicas = int(desiredReplicas(workload.Spec.Replicas))
		target.pods = filterPodsBySelector(pods.Items, namespace, selector)
		target.replicaSafetyApplies = true
	case "statefulset":
		workload, err := s.client.Kubernetes.AppsV1().StatefulSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if apierrors.IsNotFound(err) {
			target.supported = true
			return target, nil
		}
		if err != nil {
			return target, fmt.Errorf("get statefulset %s/%s: %w", namespace, name, err)
		}
		selector, err := metav1.LabelSelectorAsSelector(workload.Spec.Selector)
		if err != nil {
			return target, fmt.Errorf("build statefulset selector %s/%s: %w", namespace, name, err)
		}
		target.supported = true
		target.found = true
		target.desiredReplicas = int(desiredReplicas(workload.Spec.Replicas))
		target.pods = filterPodsBySelector(pods.Items, namespace, selector)
		target.replicaSafetyApplies = true
	case "replicaset":
		workload, err := s.client.Kubernetes.AppsV1().ReplicaSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if apierrors.IsNotFound(err) {
			target.supported = true
			return target, nil
		}
		if err != nil {
			return target, fmt.Errorf("get replicaset %s/%s: %w", namespace, name, err)
		}
		selector, err := metav1.LabelSelectorAsSelector(workload.Spec.Selector)
		if err != nil {
			return target, fmt.Errorf("build replicaset selector %s/%s: %w", namespace, name, err)
		}
		target.supported = true
		target.found = true
		target.desiredReplicas = int(desiredReplicas(workload.Spec.Replicas))
		target.pods = filterPodsBySelector(pods.Items, namespace, selector)
		target.replicaSafetyApplies = true
	case "daemonset":
		workload, err := s.client.Kubernetes.AppsV1().DaemonSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if apierrors.IsNotFound(err) {
			target.supported = true
			return target, nil
		}
		if err != nil {
			return target, fmt.Errorf("get daemonset %s/%s: %w", namespace, name, err)
		}
		selector, err := metav1.LabelSelectorAsSelector(workload.Spec.Selector)
		if err != nil {
			return target, fmt.Errorf("build daemonset selector %s/%s: %w", namespace, name, err)
		}
		target.supported = true
		target.found = true
		target.desiredReplicas = int(workload.Status.DesiredNumberScheduled)
		target.pods = filterPodsBySelector(pods.Items, namespace, selector)
	case "replicationcontroller":
		workload, err := s.client.Kubernetes.CoreV1().ReplicationControllers(namespace).Get(ctx, name, metav1.GetOptions{})
		if apierrors.IsNotFound(err) {
			target.supported = true
			return target, nil
		}
		if err != nil {
			return target, fmt.Errorf("get replicationcontroller %s/%s: %w", namespace, name, err)
		}
		selector := labels.SelectorFromSet(workload.Spec.Selector)
		target.supported = true
		target.found = true
		target.desiredReplicas = int(desiredReplicas(workload.Spec.Replicas))
		target.pods = filterPodsBySelector(pods.Items, namespace, selector)
		target.replicaSafetyApplies = true
	case "job":
		workload, err := s.client.Kubernetes.BatchV1().Jobs(namespace).Get(ctx, name, metav1.GetOptions{})
		if apierrors.IsNotFound(err) {
			target.supported = true
			return target, nil
		}
		if err != nil {
			return target, fmt.Errorf("get job %s/%s: %w", namespace, name, err)
		}
		if workload.Spec.Selector == nil {
			target.supported = true
			target.found = true
			target.desiredReplicas = int(desiredReplicas(workload.Spec.Parallelism))
			return target, nil
		}
		selector, err := metav1.LabelSelectorAsSelector(workload.Spec.Selector)
		if err != nil {
			return target, fmt.Errorf("build job selector %s/%s: %w", namespace, name, err)
		}
		target.supported = true
		target.found = true
		target.desiredReplicas = int(desiredReplicas(workload.Spec.Parallelism))
		target.pods = filterPodsBySelector(pods.Items, namespace, selector)
	default:
		target.supported = false
	}

	return target, nil
}

func (s *ClusterService) ListResourceQuotas(
	ctx context.Context,
	namespace string,
) ([]ResourceQuotaItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.CoreV1().ResourceQuotas(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list resourcequotas: %w", err)
	}

	quotas := make([]ResourceQuotaItem, 0, len(items.Items))
	for _, item := range items.Items {
		usage := resourceQuotaUsageItems(item.Spec.Hard, item.Status.Used)
		quotas = append(quotas, ResourceQuotaItem{
			Name:                     item.Name,
			Namespace:                item.Namespace,
			Status:                   resourceQuotaStatus(item, usage),
			Summary:                  resourceQuotaSummary(item, usage),
			TrackedResourceCount:     len(usage),
			ExceededResourceCount:    resourceQuotaExceededCount(usage),
			Usage:                    jsonx.Slice[ResourceQuotaUsageItem](usage),
			Scopes:                   jsonx.Slice[string](resourceQuotaScopes(item)),
			ScopeSelectorExpressions: jsonx.Slice[string](resourceQuotaScopeSelector(item)),
			Labels:                   jsonx.Slice[string](labelPairs(item.Labels)),
			Age:                      ageString(item.CreationTimestamp.Time),
			CreatedAt:                item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(quotas, func(i, j int) bool {
		leftOrder := topologyStatusOrder(quotas[i].Status)
		rightOrder := topologyStatusOrder(quotas[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if quotas[i].Namespace != quotas[j].Namespace {
			return quotas[i].Namespace < quotas[j].Namespace
		}
		return quotas[i].Name < quotas[j].Name
	})

	return quotas, nil
}

func (s *ClusterService) ListLimitRanges(
	ctx context.Context,
	namespace string,
) ([]LimitRangeItem, error) {
	namespace = normalizeNamespace(namespace)

	items, err := s.client.Kubernetes.CoreV1().LimitRanges(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("list limitranges: %w", err)
	}

	limitRanges := make([]LimitRangeItem, 0, len(items.Items))
	for _, item := range items.Items {
		limitRanges = append(limitRanges, LimitRangeItem{
			Name:       item.Name,
			Namespace:  item.Namespace,
			Status:     limitRangeStatus(item),
			Summary:    limitRangeSummary(item),
			LimitCount: len(item.Spec.Limits),
			Types:      jsonx.Slice[string](limitRangeTypes(item)),
			Limits:     jsonx.Slice[LimitRangeEntryItem](limitRangeEntries(item)),
			Labels:     jsonx.Slice[string](labelPairs(item.Labels)),
			Age:        ageString(item.CreationTimestamp.Time),
			CreatedAt:  item.CreationTimestamp.Time.Format("2006-01-02 15:04:05"),
		})
	}

	sort.Slice(limitRanges, func(i, j int) bool {
		leftOrder := topologyStatusOrder(limitRanges[i].Status)
		rightOrder := topologyStatusOrder(limitRanges[j].Status)
		if leftOrder != rightOrder {
			return leftOrder < rightOrder
		}
		if limitRanges[i].Namespace != limitRanges[j].Namespace {
			return limitRanges[i].Namespace < limitRanges[j].Namespace
		}
		return limitRanges[i].Name < limitRanges[j].Name
	})

	return limitRanges, nil
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

func (s *ClusterService) DeleteService(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteResource(ctx, "service", "Service", namespace, name)
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

func (s *ClusterService) DeleteIngress(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteResource(ctx, "ingress", "Ingress", namespace, name)
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

func (s *ClusterService) DeleteIngressClass(
	ctx context.Context,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteClusterResource(ctx, "ingressclass", "IngressClass", name)
}

func (s *ClusterService) GetServiceAccountYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "serviceaccount", "ServiceAccount", namespace, name)
}

func (s *ClusterService) UpdateServiceAccountYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(ctx, "serviceaccount", "ServiceAccount", namespace, name, content)
}

func (s *ClusterService) DeleteServiceAccount(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteResource(ctx, "serviceaccount", "ServiceAccount", namespace, name)
}

func (s *ClusterService) GetRoleYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "role", "Role", namespace, name)
}

func (s *ClusterService) UpdateRoleYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(ctx, "role", "Role", namespace, name, content)
}

func (s *ClusterService) DeleteRole(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteResource(ctx, "role", "Role", namespace, name)
}

func (s *ClusterService) GetRoleBindingYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "rolebinding", "RoleBinding", namespace, name)
}

func (s *ClusterService) UpdateRoleBindingYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(ctx, "rolebinding", "RoleBinding", namespace, name, content)
}

func (s *ClusterService) DeleteRoleBinding(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteResource(ctx, "rolebinding", "RoleBinding", namespace, name)
}

func (s *ClusterService) GetConfigMapYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "configmap", "ConfigMap", namespace, name)
}

func (s *ClusterService) UpdateConfigMapYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(ctx, "configmap", "ConfigMap", namespace, name, content)
}

func (s *ClusterService) DeleteConfigMap(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteResource(ctx, "configmap", "ConfigMap", namespace, name)
}

func (s *ClusterService) GetSecretYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "secret", "Secret", namespace, name)
}

func (s *ClusterService) UpdateSecretYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(ctx, "secret", "Secret", namespace, name, content)
}

func (s *ClusterService) DeleteSecret(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteResource(ctx, "secret", "Secret", namespace, name)
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

func (s *ClusterService) DeleteNetworkPolicy(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteResource(ctx, "networkpolicy", "NetworkPolicy", namespace, name)
}

func (s *ClusterService) GetHPAYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "hpa", "HorizontalPodAutoscaler", namespace, name)
}

func (s *ClusterService) UpdateHPAYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(ctx, "hpa", "HorizontalPodAutoscaler", namespace, name, content)
}

func (s *ClusterService) DeleteHPA(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteResource(ctx, "hpa", "HorizontalPodAutoscaler", namespace, name)
}

func (s *ClusterService) GetVPAYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(
		ctx,
		"verticalpodautoscalers.autoscaling.k8s.io",
		"VerticalPodAutoscaler",
		namespace,
		name,
	)
}

func (s *ClusterService) UpdateVPAYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(
		ctx,
		"verticalpodautoscalers.autoscaling.k8s.io",
		"VerticalPodAutoscaler",
		namespace,
		name,
		content,
	)
}

func (s *ClusterService) DeleteVPA(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteResource(
		ctx,
		"verticalpodautoscalers.autoscaling.k8s.io",
		"VerticalPodAutoscaler",
		namespace,
		name,
	)
}

func (s *ClusterService) GetResourceQuotaYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "resourcequota", "ResourceQuota", namespace, name)
}

func (s *ClusterService) UpdateResourceQuotaYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(ctx, "resourcequota", "ResourceQuota", namespace, name, content)
}

func (s *ClusterService) DeleteResourceQuota(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteResource(ctx, "resourcequota", "ResourceQuota", namespace, name)
}

func (s *ClusterService) GetLimitRangeYAML(
	ctx context.Context,
	namespace string,
	name string,
) (ResourceTextResult, error) {
	return s.GetResourceYAML(ctx, "limitrange", "LimitRange", namespace, name)
}

func (s *ClusterService) UpdateLimitRangeYAML(
	ctx context.Context,
	namespace string,
	name string,
	content string,
) (WorkloadActionResult, error) {
	return s.ApplyResourceYAML(ctx, "limitrange", "LimitRange", namespace, name, content)
}

func (s *ClusterService) DeleteLimitRange(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteResource(ctx, "limitrange", "LimitRange", namespace, name)
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

func (s *ClusterService) DeletePersistentVolumeClaim(
	ctx context.Context,
	namespace string,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteResource(
		ctx,
		"persistentvolumeclaim",
		"PersistentVolumeClaim",
		namespace,
		name,
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

func (s *ClusterService) DeletePersistentVolume(
	ctx context.Context,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteClusterResource(ctx, "persistentvolume", "PersistentVolume", name)
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

func (s *ClusterService) DeleteStorageClass(
	ctx context.Context,
	name string,
) (WorkloadActionResult, error) {
	return s.DeleteClusterResource(ctx, "storageclass", "StorageClass", name)
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

func podsByServiceAccount(items []corev1.Pod) map[string][]string {
	index := make(map[string][]string)
	for _, item := range items {
		accountName := strings.TrimSpace(item.Spec.ServiceAccountName)
		if accountName == "" {
			accountName = "default"
		}

		key := namespacedName(item.Namespace, accountName)
		index[key] = append(index[key], item.Name)
	}

	sortPodReferenceIndex(index)

	return index
}

func roleBindingsByRole(items []rbacv1.RoleBinding) map[string][]rbacv1.RoleBinding {
	index := make(map[string][]rbacv1.RoleBinding)
	for _, item := range items {
		if item.RoleRef.Kind != "Role" || strings.TrimSpace(item.RoleRef.Name) == "" {
			continue
		}

		key := namespacedName(item.Namespace, item.RoleRef.Name)
		index[key] = append(index[key], item)
	}

	return index
}

func podsByConfigMapReference(items []corev1.Pod) map[string][]string {
	index := make(map[string][]string)
	for _, item := range items {
		seen := make(map[string]struct{})

		for _, volume := range item.Spec.Volumes {
			switch {
			case volume.ConfigMap != nil:
				addReferencedPod(index, seen, item.Namespace, volume.ConfigMap.Name, item.Name)
			case volume.Projected != nil:
				for _, source := range volume.Projected.Sources {
					if source.ConfigMap == nil {
						continue
					}
					addReferencedPod(index, seen, item.Namespace, source.ConfigMap.Name, item.Name)
				}
			}
		}

		for _, container := range podSpecContainers(item.Spec) {
			for _, envFrom := range container.EnvFrom {
				if envFrom.ConfigMapRef == nil {
					continue
				}
				addReferencedPod(index, seen, item.Namespace, envFrom.ConfigMapRef.Name, item.Name)
			}

			for _, env := range container.Env {
				if env.ValueFrom == nil || env.ValueFrom.ConfigMapKeyRef == nil {
					continue
				}
				addReferencedPod(index, seen, item.Namespace, env.ValueFrom.ConfigMapKeyRef.Name, item.Name)
			}
		}
	}

	sortPodReferenceIndex(index)

	return index
}

func podsBySecretReference(items []corev1.Pod) map[string][]string {
	index := make(map[string][]string)
	for _, item := range items {
		seen := make(map[string]struct{})

		for _, imagePullSecret := range item.Spec.ImagePullSecrets {
			addReferencedPod(index, seen, item.Namespace, imagePullSecret.Name, item.Name)
		}

		for _, volume := range item.Spec.Volumes {
			switch {
			case volume.Secret != nil:
				addReferencedPod(index, seen, item.Namespace, volume.Secret.SecretName, item.Name)
			case volume.Projected != nil:
				for _, source := range volume.Projected.Sources {
					if source.Secret == nil {
						continue
					}
					addReferencedPod(index, seen, item.Namespace, source.Secret.Name, item.Name)
				}
			}
		}

		for _, container := range podSpecContainers(item.Spec) {
			for _, envFrom := range container.EnvFrom {
				if envFrom.SecretRef == nil {
					continue
				}
				addReferencedPod(index, seen, item.Namespace, envFrom.SecretRef.Name, item.Name)
			}

			for _, env := range container.Env {
				if env.ValueFrom == nil || env.ValueFrom.SecretKeyRef == nil {
					continue
				}
				addReferencedPod(index, seen, item.Namespace, env.ValueFrom.SecretKeyRef.Name, item.Name)
			}
		}
	}

	sortPodReferenceIndex(index)

	return index
}

func addReferencedPod(
	index map[string][]string,
	seen map[string]struct{},
	namespace string,
	referenceName string,
	podName string,
) {
	referenceName = strings.TrimSpace(referenceName)
	if referenceName == "" {
		return
	}

	key := namespacedName(namespace, referenceName)
	if _, exists := seen[key]; exists {
		return
	}

	seen[key] = struct{}{}
	index[key] = append(index[key], podName)
}

func sortPodReferenceIndex(index map[string][]string) {
	for key := range index {
		sort.Strings(index[key])
	}
}

func podSpecContainers(spec corev1.PodSpec) []corev1.Container {
	containers := make([]corev1.Container, 0, len(spec.InitContainers)+len(spec.Containers))
	containers = append(containers, spec.InitContainers...)
	containers = append(containers, spec.Containers...)
	return containers
}

func sortedMapKeys[T any](items map[string]T) []string {
	if len(items) == 0 {
		return nil
	}

	keys := make([]string, 0, len(items))
	for key := range items {
		keys = append(keys, key)
	}

	sort.Strings(keys)

	return keys
}

func uniqueSortedStrings(items []string) []string {
	if len(items) == 0 {
		return nil
	}

	unique := make(map[string]struct{}, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		unique[item] = struct{}{}
	}

	return sortedMapKeys(unique)
}

func configMapDataKeys(item corev1.ConfigMap) []string {
	return sortedMapKeys(item.Data)
}

func configMapBinaryDataKeys(item corev1.ConfigMap) []string {
	return sortedMapKeys(item.BinaryData)
}

func secretDataKeys(item corev1.Secret) []string {
	return sortedMapKeys(item.Data)
}

func serviceAccountStatus(item corev1.ServiceAccount) string {
	return TopologyStatusHealthy
}

func serviceAccountSummary(item corev1.ServiceAccount, podCount int) string {
	return fmt.Sprintf("Pods %d · Secrets %d · PullSecrets %d", podCount, len(item.Secrets), len(item.ImagePullSecrets))
}

func serviceAccountAutomountMode(item corev1.ServiceAccount) string {
	if item.AutomountServiceAccountToken == nil {
		return "Inherited"
	}
	if *item.AutomountServiceAccountToken {
		return "Enabled"
	}
	return "Disabled"
}

func serviceAccountSecretNames(item corev1.ServiceAccount) []string {
	names := make([]string, 0, len(item.Secrets))
	for _, secret := range item.Secrets {
		if strings.TrimSpace(secret.Name) == "" {
			continue
		}
		names = append(names, secret.Name)
	}

	return uniqueSortedStrings(names)
}

func serviceAccountImagePullSecrets(item corev1.ServiceAccount) []string {
	names := make([]string, 0, len(item.ImagePullSecrets))
	for _, secret := range item.ImagePullSecrets {
		if strings.TrimSpace(secret.Name) == "" {
			continue
		}
		names = append(names, secret.Name)
	}

	return uniqueSortedStrings(names)
}

func roleRuleItems(item rbacv1.Role) []RoleRuleItem {
	if len(item.Rules) == 0 {
		return nil
	}

	rules := make([]RoleRuleItem, 0, len(item.Rules))
	for _, rule := range item.Rules {
		rules = append(rules, RoleRuleItem{
			APIGroups:       jsonx.Slice[string](append([]string(nil), rule.APIGroups...)),
			Resources:       jsonx.Slice[string](append([]string(nil), rule.Resources...)),
			ResourceNames:   jsonx.Slice[string](append([]string(nil), rule.ResourceNames...)),
			NonResourceURLs: jsonx.Slice[string](append([]string(nil), rule.NonResourceURLs...)),
			Verbs:           jsonx.Slice[string](append([]string(nil), rule.Verbs...)),
		})
	}

	return rules
}

func roleStatus(item rbacv1.Role) string {
	if len(item.Rules) == 0 {
		return TopologyStatusWarning
	}
	return TopologyStatusHealthy
}

func roleSummary(item rbacv1.Role, boundSubjectCount int) string {
	return fmt.Sprintf("Rules %d · Subjects %d", len(item.Rules), boundSubjectCount)
}

func roleBoundSubjects(items []rbacv1.RoleBinding) []string {
	subjects := make([]string, 0)
	for _, item := range items {
		subjects = append(subjects, roleBindingSubjectSummaries(item)...)
	}

	return uniqueSortedStrings(subjects)
}

func roleBindingSubjectItems(item rbacv1.RoleBinding) []RoleBindingSubjectItem {
	if len(item.Subjects) == 0 {
		return nil
	}

	subjects := make([]RoleBindingSubjectItem, 0, len(item.Subjects))
	for _, subject := range item.Subjects {
		namespace := strings.TrimSpace(subject.Namespace)
		if subject.Kind == "ServiceAccount" && namespace == "" {
			namespace = item.Namespace
		}

		subjects = append(subjects, RoleBindingSubjectItem{
			Kind:      subject.Kind,
			Name:      subject.Name,
			Namespace: namespace,
			APIGroup:  subject.APIGroup,
		})
	}

	sort.Slice(subjects, func(i, j int) bool {
		if subjects[i].Kind != subjects[j].Kind {
			return subjects[i].Kind < subjects[j].Kind
		}
		if subjects[i].Namespace != subjects[j].Namespace {
			return subjects[i].Namespace < subjects[j].Namespace
		}
		return subjects[i].Name < subjects[j].Name
	})

	return subjects
}

func roleBindingSubjectSummary(subject rbacv1.Subject, defaultNamespace string) string {
	namespace := strings.TrimSpace(subject.Namespace)
	if subject.Kind == "ServiceAccount" {
		if namespace == "" {
			namespace = defaultNamespace
		}
		return fmt.Sprintf("ServiceAccount %s/%s", namespace, subject.Name)
	}

	if namespace != "" {
		return fmt.Sprintf("%s %s/%s", subject.Kind, namespace, subject.Name)
	}

	return fmt.Sprintf("%s %s", subject.Kind, subject.Name)
}

func roleBindingSubjectSummaries(item rbacv1.RoleBinding) []string {
	summaries := make([]string, 0, len(item.Subjects))
	for _, subject := range item.Subjects {
		summaries = append(summaries, roleBindingSubjectSummary(subject, item.Namespace))
	}

	return uniqueSortedStrings(summaries)
}

func roleBindingStatus(item rbacv1.RoleBinding) string {
	if len(item.Subjects) == 0 {
		return TopologyStatusWarning
	}
	return TopologyStatusHealthy
}

func roleBindingSummary(item rbacv1.RoleBinding) string {
	return fmt.Sprintf("%s %s · Subjects %d", item.RoleRef.Kind, item.RoleRef.Name, len(item.Subjects))
}

func configMapStatus(item corev1.ConfigMap) string {
	if len(item.Data) == 0 && len(item.BinaryData) == 0 {
		return TopologyStatusWarning
	}
	return TopologyStatusHealthy
}

func secretStatus(item corev1.Secret) string {
	if len(item.Data) == 0 {
		return TopologyStatusWarning
	}
	return TopologyStatusHealthy
}

func configMapSummary(item corev1.ConfigMap, referencedPodCount int) string {
	return fmt.Sprintf("Keys %d · Binary %d · Pods %d", len(item.Data), len(item.BinaryData), referencedPodCount)
}

func secretType(item corev1.Secret) string {
	return defaultString(strings.TrimSpace(string(item.Type)), string(corev1.SecretTypeOpaque))
}

func secretSummary(item corev1.Secret, referencedPodCount int) string {
	return fmt.Sprintf("Type %s · Keys %d · Pods %d", secretType(item), len(item.Data), referencedPodCount)
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

func hpaStatus(item autoscalingv2.HorizontalPodAutoscaler) string {
	if len(item.Spec.Metrics) == 0 {
		return TopologyStatusWarning
	}

	for _, condition := range item.Status.Conditions {
		if condition.Status != corev1.ConditionFalse {
			continue
		}

		switch condition.Type {
		case autoscalingv2.AbleToScale, autoscalingv2.ScalingActive:
			return TopologyStatusWarning
		}
	}

	if item.Status.DesiredReplicas != item.Status.CurrentReplicas {
		return TopologyStatusWarning
	}

	return TopologyStatusHealthy
}

func hpaSummary(item autoscalingv2.HorizontalPodAutoscaler) string {
	return fmt.Sprintf(
		"Replicas %d/%d · Max %d · Metrics %d",
		item.Status.CurrentReplicas,
		item.Status.DesiredReplicas,
		item.Spec.MaxReplicas,
		len(item.Spec.Metrics),
	)
}

func hpaMinReplicas(item autoscalingv2.HorizontalPodAutoscaler) int32 {
	if item.Spec.MinReplicas != nil {
		return *item.Spec.MinReplicas
	}

	return 1
}

func hpaLastScaleTime(item autoscalingv2.HorizontalPodAutoscaler) string {
	if item.Status.LastScaleTime == nil {
		return ""
	}

	return item.Status.LastScaleTime.Time.Format("2006-01-02 15:04:05")
}

func hpaConditionItems(item autoscalingv2.HorizontalPodAutoscaler) []HPAConditionItem {
	if len(item.Status.Conditions) == 0 {
		return nil
	}

	conditions := append([]autoscalingv2.HorizontalPodAutoscalerCondition(nil), item.Status.Conditions...)
	sort.SliceStable(conditions, func(i, j int) bool {
		return string(conditions[i].Type) < string(conditions[j].Type)
	})

	result := make([]HPAConditionItem, 0, len(conditions))
	for _, condition := range conditions {
		result = append(result, HPAConditionItem{
			Type:               string(condition.Type),
			Status:             string(condition.Status),
			Reason:             condition.Reason,
			Message:            condition.Message,
			LastTransitionTime: condition.LastTransitionTime.Time.Format("2006-01-02 15:04:05"),
		})
	}

	return result
}

func hpaMetricItems(item autoscalingv2.HorizontalPodAutoscaler) []HPAMetricItem {
	if len(item.Spec.Metrics) == 0 {
		return nil
	}

	result := make([]HPAMetricItem, 0, len(item.Spec.Metrics))
	for index, metric := range item.Spec.Metrics {
		metricItem := HPAMetricItem{
			Type: string(metric.Type),
		}

		var current *autoscalingv2.MetricStatus
		if index < len(item.Status.CurrentMetrics) {
			current = &item.Status.CurrentMetrics[index]
		}

		switch metric.Type {
		case autoscalingv2.ResourceMetricSourceType:
			if metric.Resource != nil {
				metricItem.Name = string(metric.Resource.Name)
				metricItem.Target = hpaMetricTargetSummary(metric.Resource.Target)
			}
			if current != nil && current.Resource != nil {
				metricItem.Current = hpaMetricValueStatusSummary(current.Resource.Current)
			}
		case autoscalingv2.ContainerResourceMetricSourceType:
			if metric.ContainerResource != nil {
				metricItem.Name = string(metric.ContainerResource.Name)
				metricItem.Container = metric.ContainerResource.Container
				metricItem.Target = hpaMetricTargetSummary(metric.ContainerResource.Target)
			}
			if current != nil && current.ContainerResource != nil {
				metricItem.Current = hpaMetricValueStatusSummary(current.ContainerResource.Current)
			}
		case autoscalingv2.PodsMetricSourceType:
			if metric.Pods != nil {
				metricItem.Name = metric.Pods.Metric.Name
				metricItem.Target = hpaMetricTargetSummary(metric.Pods.Target)
				metricItem.Selector = hpaMetricSelector(metric.Pods.Metric)
			}
			if current != nil && current.Pods != nil {
				metricItem.Current = hpaMetricValueStatusSummary(current.Pods.Current)
			}
		case autoscalingv2.ObjectMetricSourceType:
			if metric.Object != nil {
				metricItem.Name = metric.Object.Metric.Name
				metricItem.Target = hpaMetricTargetSummary(metric.Object.Target)
				metricItem.Selector = fmt.Sprintf(
					"%s %s",
					metric.Object.DescribedObject.Kind,
					metric.Object.DescribedObject.Name,
				)
			}
			if current != nil && current.Object != nil {
				metricItem.Current = hpaMetricValueStatusSummary(current.Object.Current)
			}
		case autoscalingv2.ExternalMetricSourceType:
			if metric.External != nil {
				metricItem.Name = metric.External.Metric.Name
				metricItem.Target = hpaMetricTargetSummary(metric.External.Target)
				metricItem.Selector = hpaMetricSelector(metric.External.Metric)
			}
			if current != nil && current.External != nil {
				metricItem.Current = hpaMetricValueStatusSummary(current.External.Current)
			}
		}

		if strings.TrimSpace(metricItem.Name) == "" {
			metricItem.Name = "metric"
		}
		metricItem.Summary = hpaMetricSummary(metricItem)

		result = append(result, metricItem)
	}

	return result
}

func hpaMetricTargetSummary(target autoscalingv2.MetricTarget) string {
	switch target.Type {
	case autoscalingv2.UtilizationMetricType:
		if target.AverageUtilization != nil {
			return fmt.Sprintf("%d%%", *target.AverageUtilization)
		}
	case autoscalingv2.AverageValueMetricType:
		if target.AverageValue != nil {
			return target.AverageValue.String()
		}
	case autoscalingv2.ValueMetricType:
		if target.Value != nil {
			return target.Value.String()
		}
	}

	if target.AverageUtilization != nil {
		return fmt.Sprintf("%d%%", *target.AverageUtilization)
	}
	if target.AverageValue != nil {
		return target.AverageValue.String()
	}
	if target.Value != nil {
		return target.Value.String()
	}

	return "-"
}

func hpaMetricValueStatusSummary(status autoscalingv2.MetricValueStatus) string {
	if status.AverageUtilization != nil {
		return fmt.Sprintf("%d%%", *status.AverageUtilization)
	}
	if status.AverageValue != nil {
		return status.AverageValue.String()
	}
	if status.Value != nil {
		return status.Value.String()
	}

	return "-"
}

func hpaMetricSelector(metric autoscalingv2.MetricIdentifier) string {
	pairs := selectorPairs(metric.Selector)
	if len(pairs) == 0 {
		return ""
	}

	return strings.Join(pairs, ", ")
}

func hpaMetricSummary(item HPAMetricItem) string {
	parts := make([]string, 0, 3)
	if strings.TrimSpace(item.Current) != "" && item.Current != "-" {
		parts = append(parts, "Current "+item.Current)
	}
	if strings.TrimSpace(item.Target) != "" && item.Target != "-" {
		parts = append(parts, "Target "+item.Target)
	}
	if strings.TrimSpace(item.Container) != "" {
		parts = append(parts, "Container "+item.Container)
	}
	if strings.TrimSpace(item.Selector) != "" {
		parts = append(parts, item.Selector)
	}
	if len(parts) == 0 {
		return item.Type
	}

	return strings.Join(parts, " · ")
}

func hpaBehaviorSummary(item autoscalingv2.HorizontalPodAutoscaler) string {
	if item.Spec.Behavior == nil {
		return "Default behavior"
	}

	parts := make([]string, 0, 2)
	if item.Spec.Behavior.ScaleUp != nil {
		parts = append(parts, fmt.Sprintf("ScaleUp %d policies", len(item.Spec.Behavior.ScaleUp.Policies)))
	}
	if item.Spec.Behavior.ScaleDown != nil {
		parts = append(parts, fmt.Sprintf("ScaleDown %d policies", len(item.Spec.Behavior.ScaleDown.Policies)))
	}
	if len(parts) == 0 {
		return "Custom behavior"
	}

	return strings.Join(parts, " · ")
}

func isKubectlMissingResourceError(err error) bool {
	if err == nil {
		return false
	}

	message := strings.ToLower(err.Error())
	return strings.Contains(message, "the server doesn't have a resource type") ||
		strings.Contains(message, "could not find the requested resource") ||
		strings.Contains(message, "no matches for kind")
}

func isKubectlNotFoundError(err error) bool {
	if err == nil {
		return false
	}

	message := strings.ToLower(err.Error())
	return strings.Contains(message, " not found") ||
		strings.Contains(message, "(notfound)") ||
		strings.Contains(message, "the server could not find the requested resource")
}

func isKubectlForbiddenError(err error) bool {
	if err == nil {
		return false
	}

	message := strings.ToLower(err.Error())
	return strings.Contains(message, "forbidden") || strings.Contains(message, "(forbidden)")
}

func vpaUpdateMode(item vpaResource) string {
	if item.Spec.UpdatePolicy == nil || item.Spec.UpdatePolicy.UpdateMode == nil {
		return "Default"
	}

	mode := strings.TrimSpace(*item.Spec.UpdatePolicy.UpdateMode)
	if mode == "" {
		return "Default"
	}

	return mode
}

func vpaStatusValue(item vpaResource, recommendations []VPARecommendationItem) string {
	targetKind := strings.TrimSpace(item.Spec.TargetRef.Kind)
	targetName := strings.TrimSpace(item.Spec.TargetRef.Name)
	if targetKind == "" || targetName == "" {
		return TopologyStatusWarning
	}

	for _, condition := range item.Status.Conditions {
		switch strings.ToLower(condition.Type) {
		case "recommendationprovided":
			if strings.EqualFold(condition.Status, "false") {
				return TopologyStatusWarning
			}
		case "configunsupported", "lowconfidence", "nopodsmatched", "fetchinghistory":
			if strings.EqualFold(condition.Status, "true") {
				return TopologyStatusWarning
			}
		}
	}

	if len(recommendations) == 0 {
		return TopologyStatusWarning
	}

	return TopologyStatusHealthy
}

func vpaSummary(item vpaResource, recommendations []VPARecommendationItem) string {
	target := fmt.Sprintf("%s/%s", item.Spec.TargetRef.Kind, item.Spec.TargetRef.Name)
	if strings.TrimSpace(item.Spec.TargetRef.Kind) == "" || strings.TrimSpace(item.Spec.TargetRef.Name) == "" {
		target = "No target"
	}

	return fmt.Sprintf(
		"Target %s · Update %s · Recos %d",
		target,
		vpaUpdateMode(item),
		len(recommendations),
	)
}

func vpaResourcePolicies(item vpaResource) []VPAContainerPolicyItem {
	if item.Spec.ResourcePolicy == nil || len(item.Spec.ResourcePolicy.ContainerPolicies) == 0 {
		return nil
	}

	result := make([]VPAContainerPolicyItem, 0, len(item.Spec.ResourcePolicy.ContainerPolicies))
	for _, policy := range item.Spec.ResourcePolicy.ContainerPolicies {
		mode := "Default"
		if policy.Mode != nil && strings.TrimSpace(*policy.Mode) != "" {
			mode = strings.TrimSpace(*policy.Mode)
		}

		controlledValues := ""
		if policy.ControlledValues != nil {
			controlledValues = strings.TrimSpace(*policy.ControlledValues)
		}

		result = append(result, VPAContainerPolicyItem{
			ContainerName:       policy.ContainerName,
			Mode:                mode,
			ControlledResources: jsonx.Slice[string](append([]string(nil), policy.ControlledResources...)),
			ControlledValues:    controlledValues,
			MinAllowed:          jsonx.Slice[string](resourceListStrings(policy.MinAllowed)),
			MaxAllowed:          jsonx.Slice[string](resourceListStrings(policy.MaxAllowed)),
			Summary:             vpaContainerPolicySummary(policy, mode, controlledValues),
		})
	}

	sort.SliceStable(result, func(i, j int) bool {
		return result[i].ContainerName < result[j].ContainerName
	})

	return result
}

func vpaContainerPolicySummary(
	policy vpaContainerPolicy,
	mode string,
	controlledValues string,
) string {
	parts := make([]string, 0, 5)
	if mode != "" {
		parts = append(parts, "Mode "+mode)
	}
	if len(policy.ControlledResources) > 0 {
		parts = append(parts, fmt.Sprintf("Resources %d", len(policy.ControlledResources)))
	}
	if len(policy.MinAllowed) > 0 {
		parts = append(parts, fmt.Sprintf("Min %d", len(policy.MinAllowed)))
	}
	if len(policy.MaxAllowed) > 0 {
		parts = append(parts, fmt.Sprintf("Max %d", len(policy.MaxAllowed)))
	}
	if controlledValues != "" {
		parts = append(parts, "Values "+controlledValues)
	}
	if len(parts) == 0 {
		return "Default policy"
	}

	return strings.Join(parts, " · ")
}

func vpaRecommendations(item vpaResource) []VPARecommendationItem {
	if item.Status.Recommendation == nil || len(item.Status.Recommendation.ContainerRecommendations) == 0 {
		return nil
	}

	result := make([]VPARecommendationItem, 0, len(item.Status.Recommendation.ContainerRecommendations))
	for _, recommendation := range item.Status.Recommendation.ContainerRecommendations {
		target := resourceListStrings(recommendation.Target)
		lower := resourceListStrings(recommendation.LowerBound)
		upper := resourceListStrings(recommendation.UpperBound)
		uncapped := resourceListStrings(recommendation.UncappedTarget)

		result = append(result, VPARecommendationItem{
			ContainerName:  recommendation.ContainerName,
			Target:         jsonx.Slice[string](target),
			LowerBound:     jsonx.Slice[string](lower),
			UpperBound:     jsonx.Slice[string](upper),
			UncappedTarget: jsonx.Slice[string](uncapped),
			Summary:        vpaRecommendationSummary(target, lower, upper, uncapped),
		})
	}

	sort.SliceStable(result, func(i, j int) bool {
		return result[i].ContainerName < result[j].ContainerName
	})

	return result
}

func vpaRecommendationSummary(
	target []string,
	lower []string,
	upper []string,
	uncapped []string,
) string {
	parts := make([]string, 0, 3)
	if len(target) > 0 {
		parts = append(parts, fmt.Sprintf("Target %d", len(target)))
	}
	if len(lower) > 0 || len(upper) > 0 {
		parts = append(parts, fmt.Sprintf("Bounds %d/%d", len(lower), len(upper)))
	}
	if len(uncapped) > 0 {
		parts = append(parts, fmt.Sprintf("Uncapped %d", len(uncapped)))
	}
	if len(parts) == 0 {
		return "No recommendation data"
	}

	return strings.Join(parts, " · ")
}

func vpaConditions(item vpaResource) []VPAConditionItem {
	if len(item.Status.Conditions) == 0 {
		return nil
	}

	conditions := append([]vpaCondition(nil), item.Status.Conditions...)
	sort.SliceStable(conditions, func(i, j int) bool {
		return conditions[i].Type < conditions[j].Type
	})

	result := make([]VPAConditionItem, 0, len(conditions))
	for _, condition := range conditions {
		lastTransitionTime := ""
		if !condition.LastTransitionTime.Time.IsZero() {
			lastTransitionTime = condition.LastTransitionTime.Time.Format("2006-01-02 15:04:05")
		}

		result = append(result, VPAConditionItem{
			Type:               condition.Type,
			Status:             condition.Status,
			Reason:             condition.Reason,
			Message:            condition.Message,
			LastTransitionTime: lastTransitionTime,
		})
	}

	return result
}

func resourceListItems(items corev1.ResourceList) []ResourceValueItem {
	names := resourceListNames(items)
	if len(names) == 0 {
		return nil
	}

	result := make([]ResourceValueItem, 0, len(names))
	for _, name := range names {
		quantity := items[corev1.ResourceName(name)]
		result = append(result, ResourceValueItem{
			Name:  name,
			Value: quantity.String(),
		})
	}

	return result
}

func resourceListNames(items corev1.ResourceList) []string {
	if len(items) == 0 {
		return nil
	}

	names := make([]string, 0, len(items))
	for name := range items {
		names = append(names, string(name))
	}

	sort.Strings(names)

	return names
}

func resourceQuotaUsageItems(
	hard corev1.ResourceList,
	used corev1.ResourceList,
) []ResourceQuotaUsageItem {
	names := uniqueSortedStrings(append(resourceListNames(hard), resourceListNames(used)...))
	if len(names) == 0 {
		return nil
	}

	result := make([]ResourceQuotaUsageItem, 0, len(names))
	for _, name := range names {
		hardQuantity, hasHard := hard[corev1.ResourceName(name)]
		usedQuantity, hasUsed := used[corev1.ResourceName(name)]

		hardValue := "-"
		if hasHard {
			hardValue = hardQuantity.String()
		}

		usedValue := "-"
		if hasUsed {
			usedValue = usedQuantity.String()
		}

		result = append(result, ResourceQuotaUsageItem{
			Resource:     name,
			Used:         usedValue,
			Hard:         hardValue,
			UsagePercent: resourceQuotaUsagePercent(usedQuantity, hardQuantity, hasUsed, hasHard),
			Status:       resourceQuotaUsageStatus(usedQuantity, hardQuantity, hasUsed, hasHard),
		})
	}

	return result
}

func resourceQuotaUsagePercent(
	used resource.Quantity,
	hard resource.Quantity,
	hasUsed bool,
	hasHard bool,
) float64 {
	if !hasUsed || !hasHard {
		return 0
	}

	hardValue := hard.AsApproximateFloat64()
	if hardValue <= 0 {
		return 0
	}

	usedValue := used.AsApproximateFloat64()
	return math.Round((usedValue/hardValue)*1000) / 10
}

func resourceQuotaWarningCount(items []ResourceQuotaUsageItem) int {
	count := 0
	for _, item := range items {
		if item.Status == "warning" || item.Status == "exceeded" {
			count++
		}
	}

	return count
}

func resourceQuotaExceededCount(items []ResourceQuotaUsageItem) int {
	count := 0
	for _, item := range items {
		if item.Status == "exceeded" {
			count++
		}
	}

	return count
}

func resourceQuotaUsageStatus(
	used resource.Quantity,
	hard resource.Quantity,
	hasUsed bool,
	hasHard bool,
) string {
	usagePercent := resourceQuotaUsagePercent(used, hard, hasUsed, hasHard)
	switch {
	case usagePercent > 100:
		return "exceeded"
	case usagePercent >= 90:
		return "warning"
	case hasHard:
		return "within"
	default:
		return "default"
	}
}

func resourceQuotaStatus(item corev1.ResourceQuota, usage []ResourceQuotaUsageItem) string {
	if len(item.Spec.Hard) == 0 {
		return TopologyStatusWarning
	}

	for _, entry := range usage {
		if entry.Status == "exceeded" {
			return TopologyStatusError
		}
	}

	if resourceQuotaWarningCount(usage) > 0 {
		return TopologyStatusWarning
	}

	return TopologyStatusHealthy
}

func resourceQuotaSummary(item corev1.ResourceQuota, usage []ResourceQuotaUsageItem) string {
	return fmt.Sprintf(
		"Tracked %d · Exceeded %d",
		len(usage),
		resourceQuotaExceededCount(usage),
	)
}

func resourceQuotaScopes(item corev1.ResourceQuota) []string {
	if len(item.Spec.Scopes) == 0 {
		return nil
	}

	scopes := make([]string, 0, len(item.Spec.Scopes))
	for _, scope := range item.Spec.Scopes {
		scopes = append(scopes, string(scope))
	}

	sort.Strings(scopes)

	return scopes
}

func resourceQuotaScopeSelector(item corev1.ResourceQuota) []string {
	if item.Spec.ScopeSelector == nil || len(item.Spec.ScopeSelector.MatchExpressions) == 0 {
		return nil
	}

	items := make([]string, 0, len(item.Spec.ScopeSelector.MatchExpressions))
	for _, expression := range item.Spec.ScopeSelector.MatchExpressions {
		items = append(items, resourceQuotaScopeSelectorExpression(expression))
	}

	sort.Strings(items)

	return items
}

func resourceQuotaScopeSelectorExpression(
	expression corev1.ScopedResourceSelectorRequirement,
) string {
	values := append([]string(nil), expression.Values...)
	sort.Strings(values)

	switch expression.Operator {
	case corev1.ScopeSelectorOpIn, corev1.ScopeSelectorOpNotIn:
		return fmt.Sprintf(
			"%s %s [%s]",
			expression.ScopeName,
			expression.Operator,
			strings.Join(values, ", "),
		)
	default:
		return fmt.Sprintf("%s %s", expression.ScopeName, expression.Operator)
	}
}

func limitRangeStatus(item corev1.LimitRange) string {
	if len(item.Spec.Limits) == 0 {
		return TopologyStatusWarning
	}

	return TopologyStatusHealthy
}

func limitRangeSummary(item corev1.LimitRange) string {
	return fmt.Sprintf("Entries %d · Types %d", len(item.Spec.Limits), len(limitRangeTypes(item)))
}

func limitRangeTypes(item corev1.LimitRange) []string {
	types := make([]string, 0, len(item.Spec.Limits))
	for _, limit := range item.Spec.Limits {
		types = append(types, string(limit.Type))
	}

	return uniqueSortedStrings(types)
}

func limitRangeEntries(item corev1.LimitRange) []LimitRangeEntryItem {
	if len(item.Spec.Limits) == 0 {
		return nil
	}

	result := make([]LimitRangeEntryItem, 0, len(item.Spec.Limits))
	for _, limit := range item.Spec.Limits {
		result = append(result, LimitRangeEntryItem{
			Type:                 string(limit.Type),
			Summary:              limitRangeEntrySummary(limit),
			Default:              jsonx.Slice[string](resourceListStrings(limit.Default)),
			DefaultRequest:       jsonx.Slice[string](resourceListStrings(limit.DefaultRequest)),
			Min:                  jsonx.Slice[string](resourceListStrings(limit.Min)),
			Max:                  jsonx.Slice[string](resourceListStrings(limit.Max)),
			MaxLimitRequestRatio: jsonx.Slice[string](resourceListStrings(limit.MaxLimitRequestRatio)),
		})
	}

	sort.SliceStable(result, func(i, j int) bool {
		return result[i].Type < result[j].Type
	})

	return result
}

func resourceListStrings(items corev1.ResourceList) []string {
	pairs := resourceListItems(items)
	if len(pairs) == 0 {
		return nil
	}

	result := make([]string, 0, len(pairs))
	for _, pair := range pairs {
		result = append(result, fmt.Sprintf("%s=%s", pair.Name, pair.Value))
	}

	return result
}

func limitRangeEntrySummary(item corev1.LimitRangeItem) string {
	parts := make([]string, 0, 5)
	if len(item.Min) > 0 {
		parts = append(parts, fmt.Sprintf("Min %d", len(item.Min)))
	}
	if len(item.Max) > 0 {
		parts = append(parts, fmt.Sprintf("Max %d", len(item.Max)))
	}
	if len(item.Default) > 0 {
		parts = append(parts, fmt.Sprintf("Default %d", len(item.Default)))
	}
	if len(item.DefaultRequest) > 0 {
		parts = append(parts, fmt.Sprintf("DefaultRequest %d", len(item.DefaultRequest)))
	}
	if len(item.MaxLimitRequestRatio) > 0 {
		parts = append(parts, fmt.Sprintf("Ratio %d", len(item.MaxLimitRequestRatio)))
	}
	if len(parts) == 0 {
		return "No constraints"
	}

	return strings.Join(parts, " · ")
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

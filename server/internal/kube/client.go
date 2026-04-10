package kube

import (
	"fmt"
	"os"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
	metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"
)

type Client struct {
	Kubernetes kubernetes.Interface
	Metrics    metricsclient.Interface
	ConfigPath string
	RawConfig  clientcmdapiConfig
}

type clientcmdapiConfig struct {
	CurrentContext string
	AuthInfoName   string
}

func New(configPath string) (*Client, error) {
	if configPath == "" {
		return nil, fmt.Errorf("kubeconfig path is empty")
	}

	if _, err := os.Stat(configPath); err != nil {
		return nil, fmt.Errorf("stat kubeconfig: %w", err)
	}

	rawConfig, err := clientcmd.LoadFromFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("load kubeconfig: %w", err)
	}

	restConfig, err := clientcmd.BuildConfigFromFlags("", configPath)
	if err != nil {
		return nil, fmt.Errorf("build rest config: %w", err)
	}

	kubeClient, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("create kubernetes client: %w", err)
	}

	metricsClient, err := metricsclient.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("create metrics client: %w", err)
	}

	authInfoName := ""
	if context, ok := rawConfig.Contexts[rawConfig.CurrentContext]; ok {
		authInfoName = context.AuthInfo
	}

	return &Client{
		Kubernetes: kubeClient,
		Metrics:    metricsClient,
		ConfigPath: configPath,
		RawConfig: clientcmdapiConfig{
			CurrentContext: rawConfig.CurrentContext,
			AuthInfoName:   authInfoName,
		},
	}, nil
}

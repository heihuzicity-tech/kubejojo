package kube

import (
	"fmt"
	"os"
	"strings"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"
)

type Client struct {
	Kubernetes kubernetes.Interface
	Metrics    metricsclient.Interface
	ConfigPath string
	AuthMode   string
	RawConfig  clientcmdapiConfig
}

type Factory struct {
	configPath string
	rawConfig  clientcmdapiConfig
	baseConfig *rest.Config
}

type clientcmdapiConfig struct {
	CurrentContext string
	AuthInfoName   string
}

func NewFactory(configPath string) (*Factory, error) {
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

	authInfoName := ""
	if context, ok := rawConfig.Contexts[rawConfig.CurrentContext]; ok {
		authInfoName = context.AuthInfo
	}

	return &Factory{
		configPath: configPath,
		baseConfig: restConfig,
		rawConfig: clientcmdapiConfig{
			CurrentContext: rawConfig.CurrentContext,
			AuthInfoName:   authInfoName,
		},
	}, nil
}

func (f *Factory) NewClientForToken(token string) (*Client, error) {
	if strings.TrimSpace(token) == "" {
		return nil, fmt.Errorf("token is empty")
	}

	config := rest.CopyConfig(f.baseConfig)
	config.BearerToken = strings.TrimSpace(token)
	config.BearerTokenFile = ""
	config.Username = ""
	config.Password = ""
	config.CertFile = ""
	config.KeyFile = ""
	config.CertData = nil
	config.KeyData = nil
	config.AuthProvider = nil
	config.ExecProvider = nil

	return newClient(config, f.configPath, "token", f.rawConfig)
}

func newClient(
	config *rest.Config,
	configPath string,
	authMode string,
	rawConfig clientcmdapiConfig,
) (*Client, error) {
	kubeClient, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("create kubernetes client: %w", err)
	}

	metricsClient, err := metricsclient.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("create metrics client: %w", err)
	}

	return &Client{
		Kubernetes: kubeClient,
		Metrics:    metricsClient,
		ConfigPath: configPath,
		AuthMode:   authMode,
		RawConfig:  rawConfig,
	}, nil
}

package config

import (
	"os"
	"path/filepath"
	"strings"
)

type Config struct {
	HTTPAddr       string
	KubeconfigPath string
}

func Load() Config {
	return Config{
		HTTPAddr:       getEnv("HTTP_ADDR", ":8080"),
		KubeconfigPath: kubeconfigPath(),
	}
}

func kubeconfigPath() string {
	if value := strings.TrimSpace(os.Getenv("K8S_ADMIN_KUBECONFIG")); value != "" {
		return value
	}

	if value := strings.TrimSpace(os.Getenv("KUBECONFIG")); value != "" {
		parts := strings.Split(value, string(os.PathListSeparator))
		if len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return ""
	}

	return filepath.Join(homeDir, ".kube", "config")
}

func getEnv(key string, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}

	return fallback
}

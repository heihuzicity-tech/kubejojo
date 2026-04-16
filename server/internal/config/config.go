package config

import (
	"os"
	"path/filepath"
	"strings"
)

type Config struct {
	HTTPAddr       string
	KubeconfigPath string
	Update         UpdateConfig
}

type UpdateConfig struct {
	Enabled         bool
	Repository      string
	AllowedSubjects []string
	GitHubToken     string
}

func Load() Config {
	return Config{
		HTTPAddr:       getEnv("HTTP_ADDR", ":8080"),
		KubeconfigPath: kubeconfigPath(),
		Update: UpdateConfig{
			Enabled:         getEnv("KUBEJOJO_UPDATE_ENABLED", "") == "true",
			Repository:      getEnv("KUBEJOJO_UPDATE_REPOSITORY", "heihuzicity-tech/kubejojo"),
			AllowedSubjects: splitCSVEnv("KUBEJOJO_UPDATE_ALLOWED_SUBJECTS"),
			GitHubToken:     getEnv("KUBEJOJO_UPDATE_GITHUB_TOKEN", ""),
		},
	}
}

func kubeconfigPath() string {
	if value := strings.TrimSpace(os.Getenv("KUBEJOJO_KUBECONFIG")); value != "" {
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

func splitCSVEnv(key string) []string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return nil
	}

	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, item := range parts {
		trimmed := strings.TrimSpace(item)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}

	return result
}

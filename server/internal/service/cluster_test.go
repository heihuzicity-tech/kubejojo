package service

import (
	"strings"
	"testing"
)

func TestSanitizeManifestYAML(t *testing.T) {
	input := `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: demo
  namespace: demo-workloads
  uid: abc
  resourceVersion: "123"
  generation: 7
  creationTimestamp: "2026-04-13T00:00:00Z"
  managedFields:
    - manager: kubectl
  annotations:
    kubectl.kubernetes.io/last-applied-configuration: '{"kind":"Deployment"}'
    custom.example/key: keep-me
spec:
  replicas: 1
status:
  readyReplicas: 1
`

	output, err := sanitizeManifestYAML([]byte(input))
	if err != nil {
		t.Fatalf("sanitizeManifestYAML returned error: %v", err)
	}

	result := string(output)

	for _, unexpected := range []string{
		"kubectl.kubernetes.io/last-applied-configuration",
		"resourceVersion:",
		"uid:",
		"managedFields:",
		"generation:",
		"creationTimestamp:",
		"status:",
	} {
		if strings.Contains(result, unexpected) {
			t.Fatalf("expected sanitized yaml to remove %q, got:\n%s", unexpected, result)
		}
	}

	for _, expected := range []string{
		"kind: Deployment",
		"name: demo",
		"namespace: demo-workloads",
		"custom.example/key: keep-me",
		"replicas: 1",
	} {
		if !strings.Contains(result, expected) {
			t.Fatalf("expected sanitized yaml to keep %q, got:\n%s", expected, result)
		}
	}
}

func TestSanitizeManifestYAMLRemovesEmptyAnnotations(t *testing.T) {
	input := `
apiVersion: v1
kind: Pod
metadata:
  name: demo
  namespace: demo-workloads
  annotations:
    kubectl.kubernetes.io/last-applied-configuration: '{"kind":"Pod"}'
spec:
  containers:
    - name: demo
      image: nginx
`

	output, err := sanitizeManifestYAML([]byte(input))
	if err != nil {
		t.Fatalf("sanitizeManifestYAML returned error: %v", err)
	}

	result := string(output)
	if strings.Contains(result, "annotations:") {
		t.Fatalf("expected empty annotations block to be removed, got:\n%s", result)
	}
}

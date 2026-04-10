package server

import (
	"fmt"

	"github.com/zhangya/k8s-admin/server/internal/config"
	"github.com/zhangya/k8s-admin/server/internal/kube"
)

func Run() error {
	cfg := config.Load()

	clusterFactory, err := kube.NewFactory(cfg.KubeconfigPath)
	if err != nil {
		return fmt.Errorf("initialize kubernetes client factory: %w", err)
	}

	router := newRouter(clusterFactory)
	return router.Run(cfg.HTTPAddr)
}

package server

import (
	"fmt"

	"github.com/zhangya/k8s-admin/server/internal/config"
	"github.com/zhangya/k8s-admin/server/internal/kube"
	"github.com/zhangya/k8s-admin/server/internal/service"
)

func Run() error {
	cfg := config.Load()

	clusterClient, err := kube.New(cfg.KubeconfigPath)
	if err != nil {
		return fmt.Errorf("initialize kubernetes client: %w", err)
	}

	clusterService := service.NewClusterService(clusterClient)
	router := newRouter(clusterService)
	return router.Run(cfg.HTTPAddr)
}

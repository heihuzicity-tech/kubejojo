package server

import (
	"fmt"

	"github.com/heihuzicity-tech/kubejojo/server/internal/buildinfo"
	"github.com/heihuzicity-tech/kubejojo/server/internal/config"
	"github.com/heihuzicity-tech/kubejojo/server/internal/kube"
	"github.com/heihuzicity-tech/kubejojo/server/internal/service"
	"github.com/heihuzicity-tech/kubejojo/server/internal/web"
)

func Run(info buildinfo.Info) error {
	cfg := config.Load()

	clusterFactory, err := kube.NewFactory(cfg.KubeconfigPath)
	if err != nil {
		return fmt.Errorf("initialize kubernetes client factory: %w", err)
	}

	if info.IsRelease() && !web.HasEmbeddedFrontend() {
		return fmt.Errorf("release build requires embedded frontend assets under server/internal/web/dist/app")
	}

	updateService := service.NewUpdateService(info, cfg.Update, web.HasEmbeddedFrontend())
	systemLockService := service.NewSystemOperationLockService()
	router := newRouter(clusterFactory, updateService, systemLockService, info)
	return router.Run(cfg.HTTPAddr)
}

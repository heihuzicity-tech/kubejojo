package server

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/zhangya/k8s-admin/server/internal/response"
	"github.com/zhangya/k8s-admin/server/internal/service"
)

func newRouter(clusterService *service.ClusterService) *gin.Engine {
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	router.SetTrustedProxies(nil)

	router.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, response.Success(gin.H{
			"service": "k8s-admin",
			"status":  "ok",
		}))
	})

	api := router.Group("/api/v1")
	{
		api.GET("/auth/me", func(c *gin.Context) {
			c.JSON(http.StatusOK, response.Success(clusterService.GetAuthMe(c.Request.Context())))
		})

		api.GET("/namespaces", func(c *gin.Context) {
			items, err := clusterService.ListNamespaces(c.Request.Context())
			if err != nil {
				c.JSON(http.StatusInternalServerError, response.Failure("LIST_NAMESPACES_FAILED", err.Error()))
				return
			}

			c.JSON(http.StatusOK, response.Success(items))
		})

		api.GET("/overview/summary", func(c *gin.Context) {
			summary, err := clusterService.GetOverviewSummary(c.Request.Context())
			if err != nil {
				c.JSON(http.StatusInternalServerError, response.Failure("GET_OVERVIEW_FAILED", err.Error()))
				return
			}

			c.JSON(http.StatusOK, response.Success(summary))
		})

		api.GET("/overview/events/warnings", func(c *gin.Context) {
			items, err := clusterService.ListWarningEvents(c.Request.Context(), 10)
			if err != nil {
				c.JSON(http.StatusInternalServerError, response.Failure("LIST_WARNING_EVENTS_FAILED", err.Error()))
				return
			}

			c.JSON(http.StatusOK, response.Success(items))
		})

		api.GET("/overview/namespaces/pod-top", func(c *gin.Context) {
			items, err := clusterService.ListNamespacePodTop(c.Request.Context(), 5)
			if err != nil {
				c.JSON(http.StatusInternalServerError, response.Failure("LIST_NAMESPACE_POD_TOP_FAILED", err.Error()))
				return
			}

			c.JSON(http.StatusOK, response.Success(items))
		})

		api.GET("/nodes", func(c *gin.Context) {
			items, err := clusterService.ListNodes(c.Request.Context())
			if err != nil {
				c.JSON(http.StatusInternalServerError, response.Failure("LIST_NODES_FAILED", err.Error()))
				return
			}

			c.JSON(http.StatusOK, response.Success(items))
		})
	}

	return router
}

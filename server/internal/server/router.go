package server

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/zhangya/k8s-admin/server/internal/response"
)

func newRouter() *gin.Engine {
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())

	router.GET("/healthz", func(c *gin.Context) {
		c.JSON(http.StatusOK, response.Success(gin.H{
			"service": "k8s-admin",
			"status":  "ok",
		}))
	})

	api := router.Group("/api/v1")
	{
		api.GET("/auth/me", func(c *gin.Context) {
			c.JSON(http.StatusOK, response.Success(gin.H{
				"name":  "当前用户",
				"token": "development-mode",
			}))
		})

		api.GET("/namespaces", func(c *gin.Context) {
			c.JSON(http.StatusOK, response.Success([]string{
				"default",
				"kube-system",
				"kube-public",
				"kube-node-lease",
			}))
		})

		api.GET("/overview/summary", func(c *gin.Context) {
			c.JSON(http.StatusOK, response.Success(gin.H{
				"clusterStatus": "Healthy",
				"nodesReady":    "3/3",
				"namespaces":    4,
				"abnormalPods":  2,
			}))
		})

		api.GET("/nodes", func(c *gin.Context) {
			c.JSON(http.StatusOK, response.Success([]gin.H{
				{
					"name":   "k8s-master",
					"role":   "control-plane",
					"ip":     "10.0.0.101",
					"status": "Ready",
				},
				{
					"name":   "k8s-node1",
					"role":   "worker",
					"ip":     "10.0.0.102",
					"status": "Ready",
				},
				{
					"name":   "k8s-node2",
					"role":   "worker",
					"ip":     "10.0.0.103",
					"status": "Ready",
				},
			}))
		})
	}

	return router
}

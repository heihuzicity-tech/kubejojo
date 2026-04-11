package server

import (
	"context"
	"errors"
	"net/http"
	"strings"

	apierrors "k8s.io/apimachinery/pkg/api/errors"

	"github.com/gin-gonic/gin"

	"github.com/zhangya/k8s-admin/server/internal/jsonx"
	"github.com/zhangya/k8s-admin/server/internal/kube"
	"github.com/zhangya/k8s-admin/server/internal/response"
	"github.com/zhangya/k8s-admin/server/internal/service"
)

const clusterServiceContextKey = "clusterService"

type loginRequest struct {
	Token string `json:"token"`
}

type loginResponse struct {
	Name             string              `json:"name"`
	AuthMode         string              `json:"authMode"`
	CurrentContext   string              `json:"currentContext"`
	KubeconfigPath   string              `json:"kubeconfigPath"`
	Namespaces       jsonx.Slice[string] `json:"namespaces"`
	DefaultNamespace string              `json:"defaultNamespace"`
}

func newRouter(clusterFactory *kube.Factory) *gin.Engine {
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
		api.POST("/auth/login", func(c *gin.Context) {
			var req loginRequest
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, response.Failure("INVALID_LOGIN_REQUEST", "请求体格式不正确"))
				return
			}

			clusterService, err := clusterServiceFromToken(clusterFactory, req.Token)
			if err != nil {
				c.JSON(http.StatusBadRequest, response.Failure("INVALID_TOKEN", "Bearer Token 不能为空"))
				return
			}

			auth := clusterService.GetAuthMe(c.Request.Context())
			namespaces, err := clusterService.ListNamespaces(c.Request.Context())
			if err != nil {
				respondWithClusterError(c, "TOKEN_LOGIN_FAILED", err)
				return
			}

			c.JSON(http.StatusOK, response.Success(loginResponse{
				Name:             auth.Name,
				AuthMode:         auth.AuthMode,
				CurrentContext:   auth.CurrentContext,
				KubeconfigPath:   auth.KubeconfigPath,
				Namespaces:       jsonx.Slice[string](namespaces),
				DefaultNamespace: defaultNamespace(namespaces),
			}))
		})

		authorized := api.Group("/")
		authorized.Use(clusterServiceMiddleware(clusterFactory))
		{
			authorized.GET("/auth/me", func(c *gin.Context) {
				c.JSON(http.StatusOK, response.Success(mustClusterService(c).GetAuthMe(c.Request.Context())))
			})

			authorized.GET("/namespaces", func(c *gin.Context) {
				items, err := mustClusterService(c).ListNamespaces(c.Request.Context())
				if err != nil {
					respondWithClusterError(c, "LIST_NAMESPACES_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/overview/summary", func(c *gin.Context) {
				summary, err := mustClusterService(c).GetOverviewSummary(
					c.Request.Context(),
					c.Query("namespace"),
				)
				if err != nil {
					respondWithClusterError(c, "GET_OVERVIEW_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(summary))
			})

			authorized.GET("/overview/events/warnings", func(c *gin.Context) {
				items, err := mustClusterService(c).ListWarningEvents(
					c.Request.Context(),
					c.Query("namespace"),
					10,
				)
				if err != nil {
					respondWithClusterError(c, "LIST_WARNING_EVENTS_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/overview/namespaces/pod-top", func(c *gin.Context) {
				items, err := mustClusterService(c).ListNamespacePodTop(
					c.Request.Context(),
					c.Query("namespace"),
					5,
				)
				if err != nil {
					respondWithClusterError(c, "LIST_NAMESPACE_POD_TOP_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/nodes", func(c *gin.Context) {
				items, err := mustClusterService(c).ListNodes(c.Request.Context())
				if err != nil {
					respondWithClusterError(c, "LIST_NODES_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(items))
			})

			authorized.GET("/topology/graph", func(c *gin.Context) {
				graph, err := mustClusterService(c).GetTopologyGraph(
					c.Request.Context(),
					c.Query("namespace"),
					strings.Split(c.Query("sources"), ","),
				)
				if err != nil {
					respondWithClusterError(c, "GET_TOPOLOGY_GRAPH_FAILED", err)
					return
				}

				c.JSON(http.StatusOK, response.Success(graph))
			})
		}
	}

	return router
}

func clusterServiceMiddleware(clusterFactory *kube.Factory) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := bearerTokenFromHeader(c.GetHeader("Authorization"))
		clusterService, err := clusterServiceFromToken(clusterFactory, token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, response.Failure("UNAUTHORIZED", "缺少有效的 Bearer Token"))
			c.Abort()
			return
		}

		c.Set(clusterServiceContextKey, clusterService)
		c.Next()
	}
}

func clusterServiceFromToken(clusterFactory *kube.Factory, token string) (*service.ClusterService, error) {
	client, err := clusterFactory.NewClientForToken(token)
	if err != nil {
		return nil, err
	}

	return service.NewClusterService(client), nil
}

func mustClusterService(c *gin.Context) *service.ClusterService {
	value, ok := c.Get(clusterServiceContextKey)
	if !ok {
		panic("cluster service missing from context")
	}

	clusterService, ok := value.(*service.ClusterService)
	if !ok {
		panic("invalid cluster service type")
	}

	return clusterService
}

func bearerTokenFromHeader(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}

	if strings.HasPrefix(strings.ToLower(value), "bearer ") {
		return strings.TrimSpace(value[7:])
	}

	return ""
}

func defaultNamespace(items []string) string {
	for _, item := range items {
		if item == "default" {
			return item
		}
	}

	if len(items) > 0 {
		return items[0]
	}

	return "default"
}

func respondWithClusterError(c *gin.Context, code string, err error) {
	switch {
	case apierrors.IsUnauthorized(err):
		c.JSON(http.StatusUnauthorized, response.Failure(code, "Bearer Token 无效或已过期"))
	case apierrors.IsForbidden(err):
		c.JSON(http.StatusForbidden, response.Failure(code, "当前 Token 权限不足，无法访问所需资源"))
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		c.JSON(http.StatusRequestTimeout, response.Failure(code, "请求已取消"))
	default:
		c.JSON(http.StatusInternalServerError, response.Failure(code, err.Error()))
	}
}

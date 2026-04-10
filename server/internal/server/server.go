package server

func Run() error {
	router := newRouter()
	return router.Run(":8080")
}

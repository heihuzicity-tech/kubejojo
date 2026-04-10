package main

import (
	"log"

	"github.com/zhangya/k8s-admin/server/internal/server"
)

func main() {
	if err := server.Run(); err != nil {
		log.Fatal(err)
	}
}

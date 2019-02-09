package main

import "github.com/cretz/mypc.icu/host/rtccap"

func main() {
	cap, err := rtccap.Start()
	if err != nil {
		panic(err)
	}
	defer cap.Close()
	// Wait until UI window is closed
	<-cap.Done()
}

package main

import (
	"context"
	"log"
	"time"

	"github.com/cretz/mypc.icu/host/rtccap"
	"github.com/pions/webrtc"
	"github.com/pions/webrtc/pkg/media/ivfwriter"
)

func main() {
	// Use VP8
	webrtc.RegisterCodec(webrtc.NewRTCRtpVP8Codec(webrtc.DefaultPayloadTypeVP8, 90000))

	log.Println("Starting screen cap...")
	errCh := make(chan error, 1)
	cap, err := rtccap.Start(rtccap.Config{
		OnErr: func(e error) { errCh <- e },
		OnLog: func(s string) { log.Println(s) },
	})
	if err != nil {
		panic(err)
	}
	defer cap.Close()
	// Let's record for 1 minute
	log.Println("Screen cap started, recording for a bit...")
	w, err := ivfwriter.New("output.ivf")
	if err != nil {
		panic(err)
	}
	ctx, _ := context.WithTimeout(context.Background(), 15*time.Second)
	// Write packets and/or wait until done
	for {
		select {
		case p := <-cap.Track.Packets:
			if err = w.AddPacket(p); err != nil {
				panic(err)
			}
		case err = <-errCh:
			panic(err)
		case <-cap.Done():
			log.Println("Window closed")
			return
		case <-ctx.Done():
			log.Println("Time's up")
			return
		}
	}
}

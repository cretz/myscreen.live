package rtccap

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io/ioutil"
	"net"
	"net/http"
	"path"
	"runtime"
	"time"

	"github.com/pions/rtcp"
	"github.com/pions/webrtc"
	"github.com/pions/webrtc/pkg/ice"
	"github.com/zserge/lorca"
)

type RTCCap struct {
	Track *webrtc.RTCTrack

	config              Config
	peerIdentity        string
	localhostWebserver  *http.Server
	chrome              lorca.UI
	peerConn            *webrtc.RTCPeerConnection
	trackTickerCancelFn context.CancelFunc
}

type Config struct {
	OnErr func(error)
	OnLog func(string)

	// If zero/unset, will be DefaultScreenRecordStartTimeout
	ScreenRecordStartTimeout time.Duration
	Trace                    bool
}

const DefaultScreenRecordStartTimeout = 10 * time.Minute

func Start(config Config) (*RTCCap, error) {
	// XXX: No matter what I do, I cannot get a "data:text/html," URL to be seen as secure
	//	enough to capture the screen or disable the security check. I've tried all sorts of
	//	options including:
	//	* --unsafely-treat-insecure-origin-as-secure=<all sorts of things here>
	//	* --allow-http-screen-capture
	//	* --allow-running-insecure-content
	//	* --disable-web-security
	//	So, I'm just gonna make it a localhost web server for now sadly...

	// NOTE: do not early return from this function, close at the end for any error
	cap := &RTCCap{config: config, peerIdentity: randString(40)}
	// Start local web server
	localURL, err := cap.startLocalhostWebserver()
	cap.log("Started local web server for %v", localURL)
	// Start lorca
	if err == nil {
		cap.log("Starting Chrome")
		err = cap.startChrome(localURL)
	}
	// Start the RTC conn
	if err == nil {
		cap.log("Starting track")
		err = cap.startTrack()
	}
	if err == nil {
		cap.log("Track started")
		return cap, nil
	}
	cap.Close()
	return nil, err
}

func (r *RTCCap) Done() <-chan struct{} {
	return r.chrome.Done()
}

func (r *RTCCap) log(format string, v ...interface{}) {
	if r.config.OnLog != nil {
		r.config.OnLog(fmt.Sprintf(format, v...))
	}
}

func (r *RTCCap) startLocalhostWebserver() (url string, err error) {
	// TODO: being lazy here during dev and loading from source disk
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		return "", fmt.Errorf("No caller info")
	}
	html, err := ioutil.ReadFile(path.Join(path.Dir(filename), "page.html"))
	if err != nil {
		return "", err
	}
	// Just a simple random path as rand base-64'd bytes
	var randBytes [40]byte
	if _, err = rand.Read(randBytes[:]); err != nil {
		return "", err
	}
	randStr := randString(40)
	// Start listener on random port
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", err
	}
	host := fmt.Sprintf("localhost:%v", listener.Addr().(*net.TCPAddr).Port)
	// Create single path mux
	mux := http.NewServeMux()
	mux.HandleFunc("/"+randStr, func(w http.ResponseWriter, r *http.Request) {
		// DNS rebinding prevention
		if r.Host != host {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(html)
	})
	// Serve in the background
	r.localhostWebserver = &http.Server{Handler: mux}
	// TODO: Let's use a self-signed cert here...
	// TODO: Errs?
	go func() { r.localhostWebserver.Serve(listener) }()
	// Return the local URL to use
	return "http://" + host + "/" + randStr, nil
}

func (r *RTCCap) startChrome(localURL string) (err error) {
	// Can't do headless sadly
	r.chrome, err = lorca.New(localURL, "", 200, 200,
		"--auto-select-desktop-capture-source=Entire screen")
	return
}

func (r *RTCCap) startTrack() (err error) {
	// Start the conn
	r.peerConn, err = webrtc.New(webrtc.RTCConfiguration{PeerIdentity: r.peerIdentity})
	if err != nil {
		return err
	}
	// Log state changes
	if r.config.OnLog != nil {
		r.peerConn.OnICEConnectionStateChange(func(s ice.ConnectionState) {
			r.config.OnLog(fmt.Sprintf("RTC server state change: %v", s))
		})
	}
	// Create a channel and callback for the track
	trackCh := make(chan *webrtc.RTCTrack, 1)
	// This context helps us stop the ticker in the next go
	var trackTickerCtx context.Context
	trackTickerCtx, r.trackTickerCancelFn = context.WithCancel(context.Background())
	r.peerConn.OnTrack(func(t *webrtc.RTCTrack) {
		r.peerConn.OnTrack(nil)
		trackCh <- t
		// Quote from example code:
		// Send a PLI on an interval so that the publisher is pushing a keyframe every rtcpPLIInterval
		// This is a temporary fix until we implement incoming RTCP events, then we would push a PLI
		// only when a viewer requests it
		go func() {
			ticker := time.NewTicker(time.Second * 3)
			defer ticker.Stop()
			for range ticker.C {
				if trackTickerCtx.Err() != nil {
					break
				}
				err := r.peerConn.SendRTCP(&rtcp.PictureLossIndication{MediaSSRC: t.Ssrc})
				if err != nil && r.config.OnErr != nil {
					r.config.OnErr(err)
				}
			}
		}()
	})
	// Track the resulting error and/or answer
	errCh := make(chan error, 1)
	// Now that we're waiting on the track, bind the three functions
	err = r.chrome.Bind("logErr", func(s string) {
		logErr := errors.New(s)
		if r.config.OnErr != nil {
			r.config.OnErr(logErr)
		}
		// Also send to channel if we can
		select {
		case errCh <- logErr:
		default:
		}
	})
	if err != nil {
		return err
	}
	err = r.chrome.Bind("logInfo", func(s string) {
		r.log(s)
	})
	if err != nil {
		return err
	}
	err = r.chrome.Bind("getAnswer", func(sdp webrtc.RTCSessionDescription) (ans webrtc.RTCSessionDescription) {
		ansErr := r.peerConn.SetRemoteDescription(sdp)
		if ansErr == nil {
			if r.config.Trace {
				r.log("Got offer: %v", sdp)
			}
			ans, ansErr = r.peerConn.CreateAnswer(nil)
			if r.config.Trace {
				r.log("Sending back ans: %v", ans)
			}
		}
		// Send to err chan if we can
		if ansErr != nil {
			select {
			case errCh <- ansErr:
			default:
			}
		}
		return
	})
	if err != nil {
		return err
	}
	// Now, call run with the peer identity
	r.log("Running with peer identity '%v'", r.peerIdentity)
	r.chrome.Eval("run('" + r.peerIdentity + "')")
	// Wait for either the track or the error or a timeout
	timeout := r.config.ScreenRecordStartTimeout
	if timeout == 0 {
		timeout = DefaultScreenRecordStartTimeout
	}
	select {
	case err = <-errCh:
	case r.Track = <-trackCh:
	case <-time.After(timeout):
		err = fmt.Errorf("Timed out after %v", timeout)
	}
	return err
}

func (r *RTCCap) Close() error {
	errs := []error{}
	if r.chrome != nil {
		if err := r.chrome.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	if r.localhostWebserver != nil {
		if err := r.localhostWebserver.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	if r.peerConn != nil {
		if err := r.peerConn.Close(); err != nil {
			errs = append(errs, err)
		}
	}
	if len(errs) == 0 {
		return nil
	} else if len(errs) == 1 {
		return errs[0]
	} else {
		return nil
	}
}

func randString(len int) string {
	randBytes := make([]byte, len)
	if _, err := rand.Read(randBytes); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(randBytes)[:len]
}

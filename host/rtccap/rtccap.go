package rtccap

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io/ioutil"
	"net"
	"net/http"
	"path"
	"runtime"

	"github.com/zserge/lorca"
)

type RTCCap struct {
	lorca.UI
	localhostHTTPServer *http.Server
}

func Start() (*RTCCap, error) {
	// XXX: No matter what I do, I cannot get a "data:text/html," URL to be seen as secure
	//	enough to capture the screen or disable the security check. I've tried all sorts of
	//	options including:
	//	* --unsafely-treat-insecure-origin-as-secure=<all sorts of things here>
	//	* --allow-http-screen-capture
	//	* --allow-running-insecure-content
	//	* --disable-web-security
	//	So, I'm just gonna make it a localhost web server for now sadly.
	ret := &RTCCap{}
	localURL, err := ret.startLocalhostWebserver()
	if err != nil {
		return nil, err
	}
	// Start lorca
	ret.UI, err = lorca.New(localURL, "", 200, 200,
		"--auto-select-desktop-capture-source=Entire screen")
	if err != nil {
		ret.Close()
		return nil, err
	}
	return ret, nil
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
	randStr := base64.RawURLEncoding.EncodeToString(randBytes[:])
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
	r.localhostHTTPServer = &http.Server{Handler: mux}
	// TODO: Let's use a self-signed cert here...
	go func() { r.localhostHTTPServer.Serve(listener) }()
	// Return the local URL to use
	return "http://" + host + "/" + randStr, nil
}

func (r *RTCCap) Close() (err error) {
	// Just return last error
	if r.UI != nil {
		err = r.UI.Close()
	}
	if r.localhostHTTPServer != nil {
		err = r.localhostHTTPServer.Close()
	}
	return
}

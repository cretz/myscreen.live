# myscreen.live

myscreen.live is a free service that simplifies WebRTC screen sharing. There are two components:

* [www/](www) - The source for https://myscreen.live. The built (and downloadable for use) version is present in the
  `gh-pages` branch.
* [host/](host) - The downloadable tool to support controlling the mouse and keyboard. This is still in development.

## www

The [www/](www) folder contains the source for the https://myscreen.live. It is a very simple site. The HTML files are
in [www/dist/](www/dist). The single `index.js` file they reference in the same folder is built by webpack from the
TypeScript sources in [www/src/](www/src).

To build the `www/dist/index.js` file, simply run `npm run build` from the `www` folder. The entirety of `www/dist` is
what should be committed to the `gh-pages` branch.

For development, running `npm run dev` in `www` will update `www/dist/index.js` with a non-minified version of the
source every time a TypeScript file changes. With Go installed, running `go run local_web_server.go` in `www` will make
the site visible at http://127.0.0.1:8080 though most features work just opening the `www/dist/index.html` file in the
browser directly.
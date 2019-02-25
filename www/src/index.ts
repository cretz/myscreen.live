/// <reference path="defs.d.ts" />

import adapter from 'webrtc-adapter'

import ClientPage from './clientPage'
import HomePage from './homePage'
import HostPage from './hostPage'

(function() {
  const clientPage = new ClientPage()
  const homePage = new HomePage()
  const hostPage = new HostPage()

  function runPage(firstRun: Boolean) {
    homePage.reset()
    if (firstRun) {
      // Ref: https://github.com/webrtcHacks/adapter/pull/841
      // TODO: remove when 66 is shipped: https://bugzilla.mozilla.org/show_bug.cgi?id=1321221
      if (adapter.browserDetails.browser == 'firefox')
        adapter.browserShim!.shimGetDisplayMedia!(window, 'screen')
    } else {
      clientPage.reset()
      hostPage.reset()
    }

    // If it's an empty hash, it's home
    if (!window.location.hash) homePage.show()
    else if (window.location.hash == '#host') hostPage.show()
    else clientPage.show()
  }

  // Attach the state handler and go
  window.onpopstate = () => runPage(false)
  runPage(true)
})()
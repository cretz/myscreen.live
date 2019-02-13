/// <reference path="extras.d.ts" />

import adapter from 'webrtc-adapter'

import ClientPage from './clientPage'
import HomePage from './homePage'
import HostPage from './hostPage'

namespace mycpuicu {

  const clientPage = new ClientPage()
  const homePage = new HomePage()
  const hostPage = new HostPage()

  function runPage(firstRun: Boolean) {
    if (firstRun) {
      // TODO: Remove this when we don't have to manually run it
      if (adapter.browserDetails.browser == 'firefox')
        adapter.browserShim!.shimGetDisplayMedia!(window, 'screen')
    } else {
      clientPage.reset()
      homePage.reset()
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
}
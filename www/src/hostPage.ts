/// <reference path="extras.d.ts" />

import words from "./words.json"

export default class HostPage {
  elem: HTMLElement
  settingsElem: HTMLElement
  phraseElem: HTMLInputElement
  passwordElem: HTMLInputElement
  workingElem: HTMLElement
  sharingElem: HTMLElement
  videoElem: HTMLVideoElement

  stream?: MediaStream
  rtcConns: RTCPeerConnection[] = []

  constructor() {
    this.elem = document.getElementById('host')!

    this.settingsElem = document.getElementById('hostSettings')!
    this.phraseElem = document.getElementById('hostPhrase') as HTMLInputElement
    this.passwordElem = document.getElementById('hostPassword') as HTMLInputElement
    
    this.workingElem = document.getElementById('hostWorking')!
    
    this.sharingElem = document.getElementById('hostSharing')!
    this.videoElem = document.getElementById('hostVideo') as HTMLVideoElement
    
    // Handlers
    document.getElementById('hostRegenerate')!.onclick = () =>
      this.regeneratePhrase()
    this.phraseElem.onchange = () =>
      document.getElementById('hostPotentialUrl')!.innerText = this.getClientUrl()
    this.phraseElem.oninput = () =>
      document.getElementById('hostPotentialUrl')!.innerText = this.getClientUrl()
    document.getElementById('hostChooseScreen')!.onclick = async () =>
      this.startShare()
  }

  show() {
    this.elem.style.display = 'flex'
    this.regeneratePhrase()
  }

  reset() {
    this.elem.style.display = 'none'
    this.settingsElem.style.display = 'flex'
    this.phraseElem.value = ''
    this.passwordElem.value = ''
    this.workingElem.style.display = 'none'
    this.sharingElem.style.display = 'none'
    // TODO: stop rtcConns
    // TODO: stop video, remove/stop srcObject
    // TODO: stop stream

  }

  getClientUrl() {
    const url = window.location.href
    const newHash = encodeURIComponent(this.phraseElem.value.replace(/ /gi, '-'))
    return url.substring(0, url.lastIndexOf('#')) + '#' + newHash
  }

  regeneratePhrase() {
    // <random-num> <random adj> <random noun>
    const arr = new Uint16Array(3)
    crypto.getRandomValues(arr)
    this.phraseElem.value = '' +
      // Random number from 2 to 500
      (arr[0] % 499 + 2) + ' ' +
      words.adjectives[arr[1] % words.adjectives.length] + ' ' +
      words.nouns[arr[2] % words.nouns.length]
    this.phraseElem.dispatchEvent(new Event('change', { bubbles: true }))
  }

  async startShare() {
    // Make sure there's a valid phrase
    if (!this.phraseElem.reportValidity()) return
    // Hide the settings, show the "working"
    this.settingsElem.style.display = 'none'
    this.workingElem.style.display = 'flex'
    // Request the screen capture
    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false
      })
      this.videoElem.srcObject = this.stream!
      await this.videoElem.play()
      this.workingElem.style.display = 'none'
      this.sharingElem.style.display = 'flex'
    } catch (err) {
      // TODO: fallback to settings, giving the error
      console.error(err)
    }
    // TODO: Connect to web socket to listen for offer requests

    // We don't create RTC connections yet, rather we just create the screen
    // video and then listen on the web socket for offer requests.

  }

  async offerRequested() {
    // TODO: Create RTC connection, create offer, send it, etc
  }
}

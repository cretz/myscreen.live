/// <reference path="defs.d.ts" />

import words from './words.json'
import { simpleUTCDateString, signalRoomName, offerRequestDecrypted, KeyPair, genKeyPair, offerDecrypted, offerEncrypted, answerDecrypted } from './util';

const webSocketUriBase = 'wss://connect.websocket.in/myscreen-live?room_id='

export default class HostPage {
  elem: HTMLElement
  settingsElem: HTMLElement
  phraseElem: HTMLInputElement
  passwordElem: HTMLInputElement
  workingElem: HTMLElement
  sharingElem: HTMLElement
  videoElem: HTMLVideoElement

  stream?: MediaStream
  signalSockets?: [SignalSocket, SignalSocket, SignalSocket]
  peerConns: RTCPeerConnection[] = []

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
      // TODO: try/catch, show err and settings back if necessary
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
    this.stop()
  }

  stop() {
    // TODO: stop rtcConns
    // TODO: stop signalSockets
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
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always' },
      audio: false
    })
    this.videoElem.srcObject = this.stream!
    await this.videoElem.play()
    this.workingElem.style.display = 'none'
    this.sharingElem.style.display = 'flex'
    // Listen on signal sockets for yesterday, today, and tomorrow just in case
    this.signalSockets = [
      await SignalSocket.create(this.stream, this.phraseElem.value, new Date(), -1,
        this.passwordElem.value, peerConn => this.onNewClient(peerConn)),
      await SignalSocket.create(this.stream, this.phraseElem.value, new Date(), 0,
        this.passwordElem.value, peerConn => this.onNewClient(peerConn)),
      await SignalSocket.create(this.stream, this.phraseElem.value, new Date(), 1,
        this.passwordElem.value, peerConn => this.onNewClient(peerConn))
    ]
  }

  onNewClient(peerConn: RTCPeerConnection) {
    this.peerConns.push(peerConn)
  }
}

interface PendingAnswer {
  myKey: KeyPair
  theirPub: Uint8Array
  peerConn: RTCPeerConnection
}

// 1 minute is our max for now which is fine
const maxMsForAnswer = 60 * 1000

class SignalSocket {
  stream: MediaStream
  phrase: string
  date: Date
  ws: WebSocket
  password: string
  onNewClient: (answer: RTCPeerConnection) => void
  pendingAnswers: PendingAnswer[] = []

  static create(stream: MediaStream, phrase: string, d: Date, yearDiff: number, password: string,
      onNewClient: (answer: RTCPeerConnection) => void) {
    return new Promise<SignalSocket>((resolve, reject) => {
      d.setUTCFullYear(d.getUTCFullYear() + yearDiff)
      const ws = new WebSocket(webSocketUriBase + signalRoomName(phrase, d))
      ws.onopen = () => resolve(new SignalSocket(stream, phrase, d, password, onNewClient, ws))
      ws.onerror = () => reject(new Error('Failed opening websocket'))
    })
  }

  constructor(stream: MediaStream, phrase: string, date: Date, password: string,
      onNewClient: (answer: RTCPeerConnection) => void, ws: WebSocket) {
    this.stream = stream
    this.phrase = phrase
    this.date = date
    this.password = password
    this.onNewClient = onNewClient
    this.ws = ws
    this.ws.onmessage = (event) => {
      // This can be an offer request or an answer. What we try to do is decrypt
      // the offer request and if that fails, we try each pending answer.
      const offerRequest = offerRequestDecrypted(event.data, this.phrase, this.date, this.password)
      if (offerRequest != null) {
        this.onOfferRequest(offerRequest)
      } else {
        for (const pendingAnswer of this.pendingAnswers) {
          const answer = answerDecrypted(event.data, pendingAnswer.myKey.privateKey, pendingAnswer.theirPub)
          if (answer != null) {
            this.onAnswerReceived(pendingAnswer, answer)
            break
          }
        }
      }
    }
  }

  onOfferRequest(theirPub: Uint8Array) {
    // Create the connection
    const peerConn = new RTCPeerConnection({
      // TODO: configurable TURN servers
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      // TODO: peerIdentity?
    })
    // Create the answer (add it later) and closer
    const myKey = genKeyPair()
    const pendingAnswer = { myKey, theirPub, peerConn }
    const closePendingAnswer = () => {
      const answerIndex = this.pendingAnswers.indexOf(pendingAnswer)
      if (answerIndex >= 0) {
        peerConn.close()
        this.pendingAnswers.splice(answerIndex, 1)
      }
    }
    // We'll log the state changes for now
    peerConn.onconnectionstatechange = e => console.log('RTC browser state change: ' + peerConn.iceConnectionState)
    // A null candidate means we're done and can send answer
    peerConn.onicecandidate = event => {
      if (event.candidate === null) {
        if (peerConn.localDescription == null) throw new Error('Missing local desc')
        // Add to waiting list
        this.pendingAnswers.push(pendingAnswer)
        // We're only going to wait so long before removing it
        setTimeout(() => closePendingAnswer(), maxMsForAnswer)
        // Send it off
        this.ws.send(offerEncrypted(peerConn.localDescription, myKey, theirPub))
      }
    }
    // Create the offer when negotiation needed
    peerConn.onnegotiationneeded = e =>
      peerConn.createOffer().then(d => peerConn.setLocalDescription(d)).catch(err => {
        closePendingAnswer()
        console.error(err)
      })
    // Now add the stream to start it all off
    this.stream.getTracks().forEach(track => peerConn.addTrack(track, this.stream))
  }

  async onAnswerReceived(pendingAnswer: PendingAnswer, answer: RTCSessionDescriptionInit) {
    // Remove the pending answer
    const answerIndex = this.pendingAnswers.indexOf(pendingAnswer)
    if (answerIndex >= 0) this.pendingAnswers.splice(answerIndex, 1)
    // Set the remote description and then invoke the callback if present
    try {
      await pendingAnswer.peerConn.setRemoteDescription(answer)
      if (this.onNewClient != null) this.onNewClient(pendingAnswer.peerConn)
    } catch (err) {
      pendingAnswer.peerConn.close()
      console.error(err)
    }
  }
}
/// <reference path="defs.d.ts" />

import { signalRoomName, offerRequestDecrypted, KeyPair, genKeyPair, offerEncrypted, answerDecrypted, debug, randomPhrase, clientUrl, suggestedRTCConfig, getScreenCaptureUnsupportedWarning } from './util'
import { PubSub, createDefaultPubSub } from './pubsub'

export default class HostPage {
  elem: HTMLElement
  errElem: HTMLElement
  settingsElem: HTMLElement
  phraseElem: HTMLInputElement
  passwordElem: HTMLInputElement
  workingElem: HTMLElement
  sharingElem: HTMLElement
  shareUrlElem: HTMLAnchorElement
  shareClientCountElem: HTMLElement
  sharePauseElem: HTMLElement
  shareVideoElem: HTMLVideoElement

  stream?: MediaStream
  hostSignalers?: [HostSignaler, HostSignaler, HostSignaler]
  peerConns: RTCPeerConnection[] = []

  constructor() {
    this.elem = document.getElementById('host')!
    this.errElem = document.getElementById('hostErr')!

    this.settingsElem = document.getElementById('hostSettings')!
    this.phraseElem = document.getElementById('hostPhrase') as HTMLInputElement
    this.passwordElem = document.getElementById('hostPassword') as HTMLInputElement
    
    this.workingElem = document.getElementById('hostWorking')!
    
    this.sharingElem = document.getElementById('hostSharing')!
    this.shareUrlElem = document.getElementById('hostShareUrl') as HTMLAnchorElement
    this.shareClientCountElem = document.getElementById('hostShareClientCount')!
    this.sharePauseElem = document.getElementById('hostSharePause')!
    this.shareVideoElem = document.getElementById('hostShareVideo') as HTMLVideoElement

    // Set warning if unsupported
    const shareWarning = getScreenCaptureUnsupportedWarning()
    if (shareWarning != null) document.getElementById('hostWarning')!.innerText = shareWarning
    
    // Handlers
    document.getElementById('hostRegenerate')!.onclick = () =>
      this.regeneratePhrase()
    this.phraseElem.onchange = () =>
      document.getElementById('hostPotentialUrl')!.innerText = clientUrl(this.phraseElem.value)
    this.phraseElem.oninput = () =>
      document.getElementById('hostPotentialUrl')!.innerText = clientUrl(this.phraseElem.value)
    document.getElementById('hostChooseScreen')!.onclick = async () => {
      try {
        await this.startShare()
      } catch (err) {
        console.error(err)
        this.stop()
        this.displayErr(err)
      }
    }
    this.sharePauseElem.onclick = () => {
      if (this.stream != null) {
        const enabled = this.sharePauseElem.innerText != 'Pause Video'
        this.stream.getTracks().forEach(t => t.enabled = enabled)
        this.sharePauseElem.innerText = enabled ? 'Pause Video' : 'Resume Video'
      }
    }
    document.getElementById('hostShareStop')!.onclick = () =>
      this.stop()
  }

  displayErr(err: any) {
    if (err) {
      this.errElem.innerText = '' + err
      this.errElem.style.display = 'block'
    } else {
      this.errElem.innerText = ''
      this.errElem.style.display = 'none'
    }
  }

  show() {
    this.elem.style.display = 'flex'
    this.regeneratePhrase()
  }

  reset() {
    this.elem.style.display = 'none'
    this.phraseElem.value = ''
    this.passwordElem.value = ''
    this.stop()
  }

  stop() {
    // Remove error, only show settings
    this.displayErr(null)
    this.workingElem.style.display = 'none'
    this.sharingElem.style.display = 'none'
    this.settingsElem.style.display = 'flex'
    // Reset some element values
    this.sharePauseElem.innerText = 'Pause Video'
    // Close and remove all peer conns
    this.peerConns.forEach(p => p.close())
    this.peerConns = []
    // Close and remove all signal sockets
    if (this.hostSignalers != null) {
      this.hostSignalers.forEach(s => s.close())
      this.hostSignalers = undefined
    }
    // Stop and remove the stream
    if (this.stream != null) {
      this.stream.getTracks().forEach(t => t.stop())
      this.stream = undefined
    }
    // Stop the video if we can
    // ref: https://stackoverflow.com/questions/3258587/how-to-properly-unload-destroy-a-video-element
    this.shareVideoElem.pause()
    this.shareVideoElem.removeAttribute('src')
    this.shareVideoElem.load()
  }

  regeneratePhrase() {
    this.phraseElem.value = randomPhrase()
    this.phraseElem.dispatchEvent(new Event('change', { bubbles: true }))
  }

  async startShare() {
    this.shareUrlElem.innerText = clientUrl(this.phraseElem.value)
    this.shareUrlElem.href = this.shareUrlElem.innerText
    this.shareClientCountElem.innerText = '0'
    this.settingsElem.style.display = 'none'
    this.sharingElem.style.display = 'none'
    this.workingElem.style.display = 'flex'
    // Make sure there's a valid phrase
    if (!this.phraseElem.reportValidity()) return
    // Hide the settings, show the "working"
    // Request the screen capture
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always' },
      audio: false
    })
    this.shareVideoElem.srcObject = this.stream!
    await this.shareVideoElem.play()
    this.workingElem.style.display = 'none'
    this.sharingElem.style.display = 'flex'
    // Listen on signal sockets for yesterday, today, and tomorrow just in case
    this.hostSignalers = [
      await HostSignaler.create(this.stream, this.phraseElem.value, new Date(), -1,
        this.passwordElem.value, peerConn => this.onNewClient(peerConn)),
      await HostSignaler.create(this.stream, this.phraseElem.value, new Date(), 0,
        this.passwordElem.value, peerConn => this.onNewClient(peerConn)),
      await HostSignaler.create(this.stream, this.phraseElem.value, new Date(), 1,
        this.passwordElem.value, peerConn => this.onNewClient(peerConn))
    ]
  }

  onNewClient(peerConn: RTCPeerConnection) {
    this.peerConns.push(peerConn)
    this.shareClientCountElem.innerText = '' + this.peerConns.length
    peerConn.oniceconnectionstatechange = () => {
      debug('RTC browser state change: ' + peerConn.iceConnectionState)
      if (peerConn.iceConnectionState == 'closed' || peerConn.iceConnectionState == 'disconnected') {
        const index = this.peerConns.indexOf(peerConn)
        if (index >= 0) {
          this.peerConns.splice(index, 1)
          this.shareClientCountElem.innerText = '' + this.peerConns.length
        }
      }
    }
  }
}

interface PendingAnswer {
  myKey: KeyPair
  theirPub: Uint8Array
  peerConn: RTCPeerConnection
}

// 1 minute is our max for now which is fine
const maxMsForAnswer = 60 * 1000

class HostSignaler {
  stream: MediaStream
  phrase: string
  date: Date
  pubSub: PubSub
  password: string
  onNewClient: (answer: RTCPeerConnection) => void
  pendingAnswers: PendingAnswer[] = []

  static async create(stream: MediaStream, phrase: string, d: Date, yearDiff: number, password: string,
      onNewClient: (answer: RTCPeerConnection) => void) {
    d.setUTCFullYear(d.getUTCFullYear() + yearDiff)
    const roomName = signalRoomName(phrase, d)
    debug('Starting signaler on room ' + roomName)
    const signaler = await createDefaultPubSub(roomName)
    return new HostSignaler(stream, phrase, d, password, onNewClient, signaler)
  }

  constructor(stream: MediaStream, phrase: string, date: Date, password: string,
      onNewClient: (answer: RTCPeerConnection) => void, pubSub: PubSub) {
    this.stream = stream
    this.phrase = phrase
    this.date = date
    this.password = password
    this.onNewClient = onNewClient
    this.pubSub = pubSub
    this.pubSub.setSub(msg => {
      // This can be an offer request or an answer. What we try to do is decrypt
      // the offer request and if that fails, we try each pending answer.
      const offerRequest = offerRequestDecrypted(msg, this.phrase, this.date, this.password)
      if (offerRequest != null) {
        debug('Message was valid offer request', offerRequest)
        this.onOfferRequest(offerRequest)
      } else {
        for (const pendingAnswer of this.pendingAnswers) {
          const answer = answerDecrypted(msg, pendingAnswer.myKey.privateKey, pendingAnswer.theirPub)
          if (answer != null) {
            debug('Message was valid answer', answer)
            this.onAnswerReceived(pendingAnswer, answer)
            return
          }
        }
        debug('Message was unrecognized')
      }
    })
  }

  onOfferRequest(theirPub: Uint8Array) {
    // Create the connection
    const peerConn = new RTCPeerConnection(suggestedRTCConfig)
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
    peerConn.oniceconnectionstatechange = () => debug('RTC browser state change: ' + peerConn.iceConnectionState)
    // A null candidate means we're done and can send offer
    peerConn.onicecandidate = event => {
      if (event.candidate === null) {
        if (peerConn.localDescription == null) throw new Error('Missing local desc')
        // Add to waiting list
        this.pendingAnswers.push(pendingAnswer)
        // We're only going to wait so long before removing it
        setTimeout(() => closePendingAnswer(), maxMsForAnswer)
        // Send it off
        this.pubSub.pub(offerEncrypted(peerConn.localDescription, myKey, theirPub))
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

  close() {
    // Close all pending answers, then close the web socket
    this.pendingAnswers.forEach(p => p.peerConn.close())
    this.pendingAnswers = []
    this.pubSub.close()
  }
}
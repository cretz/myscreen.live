import { clientUrlDecoded, OfferResponse, signalRoomName, offerRequestEncrypted, genKeyPair, offerDecrypted, suggestedRTCConfig, debug, answerEncrypted, getScreenConnectionUnsupportedWarning } from './util'
import { createDefaultPubSub } from './pubsub'

// 1 minute is our max for now which is fine
const maxMsForAnswer = 60 * 1000

export default class ClientPage {
  elem: HTMLElement
  settingsButtonElem: HTMLElement
  settingsElem: HTMLElement
  phraseElem: HTMLInputElement
  passwordElem: HTMLInputElement
  errElem: HTMLElement
  connectingElem: HTMLElement
  videoElem: HTMLVideoElement
  peerConn?: RTCPeerConnection

  constructor() {
    this.elem = document.getElementById('client')!
    this.settingsButtonElem = document.getElementById('clientSettingsButton')!
    this.settingsElem = document.getElementById('clientSettings')!
    this.phraseElem = document.getElementById('clientPhrase') as HTMLInputElement
    this.passwordElem = document.getElementById('clientPassword') as HTMLInputElement
    this.errElem = document.getElementById('clientErr')!
    this.connectingElem = document.getElementById('clientConnecting')!
    this.videoElem = document.getElementById('clientVideo') as HTMLVideoElement

    // Set warning if unsupported
    const connectWarning = getScreenConnectionUnsupportedWarning()
    if (connectWarning != null) document.getElementById('clientWarning')!.innerText = connectWarning

    // Handlers
    this.settingsButtonElem.onclick = () => {
      if (this.settingsElem.style.display == 'none') {
        this.settingsButtonElem.innerHTML = 'Settings &#9650;'
        this.settingsElem.style.display = 'flex'
      } else {
        this.settingsButtonElem.innerHTML = 'Settings &#9660;'
        this.settingsElem.style.display = 'none'
      }
    }
    document.getElementById('clientConnect')!.onclick = () => {
      this.stop()
      this.connect()
    }
    this.videoElem.onloadedmetadata = () => {
      const width = this.videoElem.videoWidth
      const height = this.videoElem.videoHeight
      debug('Metadata loaded, width and height:', width, height)
      this.videoElem.style.width = width + 'px'
      this.videoElem.style.height = height + 'px'
    }
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
    this.phraseElem.value = clientUrlDecoded(window.location.hash)
  }

  reset() {
    this.elem.style.display = 'none'
    this.settingsButtonElem.innerHTML = 'Settings &#9650;'
    this.settingsElem.style.display = 'flex'
    this.phraseElem.value = ''
    this.passwordElem.value = ''
    this.stop()
  }

  stop() {
    this.displayErr(null)
    this.connectingElem.style.display = 'none'
    this.videoElem.style.display = 'none'
    this.videoElem.style.width = ''
    this.videoElem.style.height = ''
    // Remove the video track and stop peer conn
    this.videoElem.pause()
    this.videoElem.removeAttribute('src')
    this.videoElem.load()
    if (this.peerConn != null) {
      this.peerConn.close()
      this.peerConn = undefined
    }
  }

  async connect() {
    try {
      this.settingsButtonElem.innerHTML = 'Settings &#9660;'
      this.settingsElem.style.display = 'none'
      this.connectingElem.style.display = 'flex'
      const peerConnAndTrack = await this.connectToHost()
      this.peerConn = peerConnAndTrack.peerConn
      this.connectingElem.style.display = 'none'
      this.videoElem.style.display = 'flex'
      // Add the track to the video and show it
      debug('Got peer conn and track', peerConnAndTrack)
      this.videoElem.srcObject = peerConnAndTrack.track
      await this.videoElem.play()
    } catch (err) {
      console.error(err)
      this.stop()
      this.displayErr(err)
    }
  }

  async connectToHost(): Promise<PeerConnAndTrack> {
    // Create signaler
    const phrase = this.phraseElem.value
    const password = this.passwordElem.value
    const date = new Date()
    const signaler = await createDefaultPubSub(signalRoomName(phrase, date))
    let createdPeerConn: RTCPeerConnection | null = null
    try {
      // Send an offer request
      const myKey = genKeyPair()
      const offerRequest = offerRequestEncrypted(phrase, date, myKey.publicKey, password)
      // Set up offer response waiter
      const offerPromise = new Promise<OfferResponse>(async (resolve, reject) => {
        // We're only gonna wait so long
        setTimeout(() => reject(new Error('Timeout waiting for offer response')), maxMsForAnswer)
        // Wait for offer response
        await signaler.setSub(msg => {
          // Try to decrypt the offer or just ignore
          const offer = offerDecrypted(msg, myKey.privateKey)
          if (offer != null) {
            debug('Message was valid offer', offer)
            resolve(offer)
          }
        })
      })
      // Signal that we want an offer and wait for it
      debug('Sending offer request', offerRequest)
      await signaler.pub(offerRequest)
      const offer = await offerPromise
      // Now that we have it, we can create a peer conn and sent it back
      const peerConn = new RTCPeerConnection(suggestedRTCConfig)
      createdPeerConn = peerConn
      const peerConnPromise = new Promise<PeerConnAndTrack>(async (resolve, reject) => {
        // We're only gonna wait so long
        setTimeout(() => reject(new Error('Timeout waiting to build answer')), maxMsForAnswer)
        // We'll log the state changes for now
        peerConn.oniceconnectionstatechange = () => {
          debug('RTC browser state change: ' + peerConn.iceConnectionState)
          if (peerConn.iceConnectionState == 'closed' || peerConn.iceConnectionState == 'disconnected') {
            this.stop()
            this.displayErr('Host closed connection')
          }
        }
        // A null candidate means we're done and can send offer
        peerConn.onicecandidate = async event => {
          if (event.candidate === null) {
            if (peerConn.localDescription == null) throw new Error('Missing local desc')
            // Send the answer off and mark as complete
            debug('Sending answer', peerConn.localDescription)
            await signaler.pub(answerEncrypted(peerConn.localDescription, myKey.privateKey, offer.hostPublicKey))
          }
        }
        // Wait for the track to mark complete
        peerConn.ontrack = event => resolve({ peerConn, track: event.streams[0] })
        // Set the offer and create the answer
        await peerConn.setRemoteDescription(offer.offer)
        const answer = await peerConn.createAnswer()
        await peerConn.setLocalDescription(answer)
      })
      return await peerConnPromise
    } catch (err) {
      signaler.close()
      if (createdPeerConn != null) createdPeerConn.close()
      throw err
    }
  }
}

interface PeerConnAndTrack {
  peerConn: RTCPeerConnection
  track: MediaStream
}
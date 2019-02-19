
import nacl from 'tweetnacl'
import util from 'tweetnacl-util'
import words from './words.json'

export interface KeyPair {
  publicKey: Uint8Array
  privateKey: Uint8Array
}

export interface OfferResponse {
  offer: RTCSessionDescriptionInit
  hostPublicKey: Uint8Array
}

type Os = 'windows' | 'linux' | 'mac' | 'ios' | 'android'
type Browser = 'chrome' | 'firefox' | 'safari' | 'edge' | 'ie'

export const debugEnabled = false

export const suggestedRTCConfig: RTCConfiguration = {
  // TODO: configurable TURN servers
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  // TODO: peerIdentity?
}

export function answerDecrypted(enc: string, myPriv: Uint8Array, theirPub: Uint8Array): RTCSessionDescriptionInit | null {
  try {
    const encBytes = util.decodeBase64(enc)
    return rtcSdpDecrypted(encBytes, myPriv, theirPub)
  } catch (err) {
    // Ignore error
    return null
  }
}

export function answerEncrypted(answer: RTCSessionDescriptionInit, myPriv: Uint8Array, theirPub: Uint8Array) {
  // sdp boxed
  return util.encodeBase64(rtcSdpEncrypted(answer, myPriv, theirPub))
}

function concatBytes(a: Uint8Array, b: Uint8Array) {
  const ret = new Uint8Array(a.length + b.length)
  ret.set(a)
  ret.set(b, a.length)
  return ret
}

export function clientUrl(phrase: string) {
  const url = window.location.href
  const newHash = encodeURIComponent(phraseNormalize(phrase))
  const hashIndex = url.lastIndexOf('#')
  if (hashIndex == -1) return url + '#' + newHash
  return url.substring(0, hashIndex) + '#' + newHash
}

export function clientUrlDecoded(hash: string) {
  if (hash.startsWith('#')) hash = hash.substring(1)
  return phraseDenormalize(decodeURIComponent(hash))
}

export function debug(message?: any, ...optionalParams: any[]) {
  if (debugEnabled) console.log(message, ...optionalParams)
}

export function detectPlatform(): { os: Os | null, browser: Browser | null } {
  // This is all based on reading...tailored to be simple for my needs
  const platform = window.navigator.platform
  const userAgent = window.navigator.userAgent
  // OS first
  let os: Os | null = null
  if (platform.startsWith('Mac')) os = 'mac'
  else if (platform.startsWith('Win')) os = 'windows'
  else if (platform.startsWith('iPhone') || platform.startsWith('iPad')) os = 'ios'
  else if (userAgent.indexOf('Android') >= 0) os = 'android'
  else if (platform.startsWith('Linux')) os = 'linux'
  // Now browser
  let browser: Browser | null = null
  if (userAgent.indexOf('MSIE') >= 0 || userAgent.indexOf('Trident') >= 0) browser = 'ie'
  else if (userAgent.indexOf('Edge') >= 0) browser = 'edge'
  else if (userAgent.indexOf('Firefox') >= 0) browser = 'firefox'
  else if (userAgent.indexOf('Chrom') >= 0) browser = 'chrome'
  else if (userAgent.indexOf('Safari') >= 0 || userAgent.indexOf('AppleWebKit') >= 0) browser = 'safari'
  return { os, browser }
}

export function genKeyPair(): KeyPair {
  const pair = nacl.box.keyPair()
  return { publicKey: pair.publicKey, privateKey: pair.secretKey }
}

export function getScreenCaptureUnsupportedWarning(): string | null {
  const { os, browser } = detectPlatform()
  if (os == 'ios') return 'Screen capture not yet supported on iPhone/iPad'
  if (os == 'android') return 'Screen capture not yet supported on Android' 
  if (browser == 'ie') return 'Screen capture not supported on Internet Explorer'
  if (browser == 'edge') return 'Screen capture not yet supported on Edge'
  if (browser == 'safari') return 'Screen capture not yet supported on Safari'
  if (browser == null) return 'Unknown browser, screen capture may not be supported'
  return null
}

export function getScreenConnectionUnsupportedWarning(): string | null {
  const { os, browser } = detectPlatform()
  if (os == 'ios') return 'Screen connection not yet supported on iPhone/iPad'
  if (browser == 'ie') return 'Screen connection not supported on Internet Explorer'
  if (browser == 'edge') return 'Screen connection not yet supported on Edge' 
  if (browser == 'safari') return 'Screen connection with Safari is untested'
  if (browser == null) return 'Unknown browser, screen connection may not be supported'
  return null
}

export function offerDecrypted(enc: string, myPriv: Uint8Array): OfferResponse | null {
  try {
    const encBytes = util.decodeBase64(enc)
    if (encBytes.length < nacl.box.publicKeyLength + 1) return null
    const theirPub = encBytes.slice(-nacl.box.publicKeyLength)
    const sealed = encBytes.slice(0, -nacl.box.publicKeyLength)
    const sdp = rtcSdpDecrypted(sealed, myPriv, theirPub)
    if (sdp == null) return null
    return { offer: sdp, hostPublicKey: theirPub }
  } catch (err) {
    // Ignore error
    return null
  }
}

export function offerEncrypted(offer: RTCSessionDescriptionInit, myKey: KeyPair, theirPub: Uint8Array) {
  // sdp boxed + my pub key
  const sealed = rtcSdpEncrypted(offer, myKey.privateKey, theirPub)
  return util.encodeBase64(concatBytes(sealed, myKey.publicKey))
}

export function offerRequestDecrypted(enc: string, phrase: string, d: Date, password: string): Uint8Array | null {
  try {
    const encBytes = util.decodeBase64(enc)
    if (encBytes.length < nacl.secretbox.nonceLength + 1) return null
    const nonce = encBytes.slice(-nacl.secretbox.nonceLength)
    const sealed = encBytes.slice(0, -nacl.secretbox.nonceLength)
    const secret = nacl.secretbox.open(sealed, nonce, offerRequestEncryptionKey(phrase, d, password))
    if (secret == null) return null
    const offerRequestJson = JSON.parse(util.encodeUTF8(secret))
    if (offerRequestJson == null || offerRequestJson.offerRequest == null) return null
    return util.decodeBase64(offerRequestJson.offerRequest)
  } catch (err) {
    // Ignore error
    return null
  }
}

export function offerRequestEncrypted(phrase: string, d: Date, pubKey: Uint8Array, password: string) {
  // { offerRequest: base64(pubKey) } secret boxed
  const secret = util.decodeUTF8(JSON.stringify({ offerRequest: util.encodeBase64(pubKey) }))
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const sealed = nacl.secretbox(secret, nonce, offerRequestEncryptionKey(phrase, d, password))
  return util.encodeBase64(concatBytes(sealed, nonce))
}

function offerRequestEncryptionKey(phrase: string, d: Date, password: string) {
  // sha512(date + '-' + phrase + ['-' + password]) sliced to key size
  let toHash = simpleUTCDateString(d) + '-' + phraseNormalize(phrase)
  if (password) toHash += '-' + password
  const hash = nacl.hash(util.decodeUTF8(toHash))
  return hash.slice(0, nacl.secretbox.keyLength)
}

function phraseDenormalize(phrase: string) {
  // We turn all dashes to spaces, good enough for now
  return phrase.replace(/-/g, ' ')
}

function phraseNormalize(phrase: string) {
  // We turn all spaces to dashes, good enough for now
  return phrase.replace(/ /g, '-')
}

export function randomPhrase() {
  // Ref: https://blog.asana.com/2011/09/6-sad-squid-snuggle-softly/
  const arr = new Uint16Array(5)
  crypto.getRandomValues(arr)
  return (arr[0] % 31 + 2) + ' ' +
    words.adjectives[arr[1] % words.adjectives.length] + ' ' +
    words.nouns[arr[2] % words.nouns.length] + ' ' +
    words.verbs[arr[3] % words.verbs.length] + ' ' +
    words.adverbs[arr[4] % words.adverbs.length]
}

function rtcSdpDecrypted(encBytes: Uint8Array, myPriv: Uint8Array, theirPub: Uint8Array): RTCSessionDescriptionInit | null {
  if (encBytes.length < nacl.box.nonceLength + 1) return null
  const nonce = encBytes.slice(-nacl.box.nonceLength)
  const sealed = encBytes.slice(0, -nacl.box.nonceLength)
  const secret = nacl.box.open(sealed, nonce, theirPub, myPriv)
  if (secret == null) return null
  const sdp = JSON.parse(util.encodeUTF8(secret))
  if (sdp == null || sdp.sdp == null || sdp.type == null) return null
  return sdp
}

function rtcSdpEncrypted(sdp: RTCSessionDescriptionInit, myPriv: Uint8Array, theirPub: Uint8Array) {
  const secret = util.decodeUTF8(JSON.stringify(sdp))
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const sealed = nacl.box(secret, nonce, theirPub, myPriv)
  return concatBytes(sealed, nonce)
}

export function signalRoomName(phrase: string, d: Date) {
  // Since we are starting w/ websocket.in, we only get alnum + '_' + '-'. So
  // we'll take base64(sha512(phrase + '-' + d)), remove padding, replace '+'
  // and '/' with '_' and '-' respectively.
  let ret = util.encodeBase64(nacl.hash(util.decodeUTF8(phraseNormalize(phrase) + '-' + simpleUTCDateString(d))))
  ret = ret.replace(/=/g, '').replace(/\+/g, '_').replace(/\//g, '-')
  // Only the first 20 chars
  return ret.substring(0, 20)
}

// UTC dd-mm-yyyy, padded with zeros as necessary
export function simpleUTCDateString(d: Date) {
  let ret = '' + d.getUTCDate() + '-'
  if (ret.length == 2) ret = '0' + ret
  const month = d.getUTCMonth() + 1
  ret += month < 10 ? '0' + month : month
  return ret + '-' + d.getUTCFullYear()
}
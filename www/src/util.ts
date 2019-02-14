
import nacl from 'tweetnacl'
import util from 'tweetnacl-util'

function concatBytes(a: Uint8Array, b: Uint8Array) {
  const ret = new Uint8Array(a.length + b.length)
  ret.set(a)
  ret.set(b, a.length)
  return ret
}

export interface KeyPair {
  publicKey: Uint8Array
  privateKey: Uint8Array
}

interface OfferResponse {
  offer: RTCSessionDescriptionInit
  hostPublicKey: Uint8Array
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

export function genKeyPair(): KeyPair {
  const pair = nacl.box.keyPair()
  return { publicKey: pair.publicKey, privateKey: pair.secretKey }
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
  let toHash = simpleUTCDateString(d) + '-' + phrase
  if (password) toHash += '-' + password
  const hash = nacl.hash(util.decodeUTF8(toHash))
  return hash.slice(0, nacl.secretbox.keyLength)
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
  let ret = util.encodeBase64(nacl.hash(util.decodeUTF8(phrase + '-' + simpleUTCDateString(d))))
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
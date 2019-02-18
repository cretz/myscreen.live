/// <reference path="defs.d.ts" />

import { debug, debugEnabled } from './util'
import Gun from 'gun/gun'

export interface PubSub {
  pub(msg: string): Promise<void>
  setSub(l: (msg: string) => void): Promise<void>
  close(): Promise<void>
}

export function createDefaultPubSub(roomName: string): Promise<PubSub> {
  // websocket.in not working right now
  // return createWebSocketDotInPubSub(roomName)
  return createGunPubSub(roomName)
}

// Per https://github.com/amark/gun/pull/269#issuecomment-397967571, since this
// project is open source we can remove the welcome log. But I can't find an
// easy way to do it, so just disabled after that.
if (!debugEnabled) Gun.log.off = true

const gunUri = 'https://gunjs.herokuapp.com/gun'

async function createGunPubSub(roomName: string): Promise<GunPubSub> {
  return new GunPubSub(Gun(gunUri), roomName)
}

class GunPubSub implements PubSub {
  room: Gun

  constructor(gun: Gun, roomName: string) {
    this.room = gun.get('myscreen.live-' + roomName)
  }

  async pub(msg: string) {
    debug('Sending message', msg)
    this.room.put({ msg })
  }

  async setSub(l: (msg: string) => void) {
    this.room.on(data => {
      debug('Received message', data)
      if (data.msg) l(data.msg)
    })
  }

  async close() {
    this.room.off()
  }
}

const webSocketUriBase = 'wss://connect.websocket.in/myscreen-live-signal?room_id='

function createWebSocketDotInPubSub(roomName: string): Promise<WebSocketPubSub> {
  return createWebSocketPubSub(webSocketUriBase + encodeURIComponent(roomName))
}

function createWebSocketPubSub(url: string): Promise<WebSocketPubSub> {
  return new Promise((resolve, reject) => {
    const s = new WebSocketPubSub(url)
    s.ws.onopen = () => resolve(s)
    s.ws.onerror = () => reject(new Error('Failed opening WebSocket'))
  })
}

class WebSocketPubSub implements PubSub {
  ws: WebSocket

  constructor(url: string) {
    this.ws = new WebSocket(url)
  }

  async pub(msg: string) {
    debug('Sending message', msg)
    this.ws.send(msg)
  }

  async setSub(l: (msg: string) => void) {
    this.ws.onmessage = e => {
      debug('Received message', e)
      l(e.data)
    }
  }

  async close() {
    this.ws.close()
  }
}
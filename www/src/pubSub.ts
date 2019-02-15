
export interface PubSub {
  pub(msg: string): Promise<void>
  setSub(l: (msg: string) => void): Promise<void>
  close(): Promise<void>
}

const webSocketUriBase = 'wss://connect.websocket.in/myscreen-live?room_id='

export function createDefaultPubSub(roomName: string): Promise<PubSub> {
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

  pub(msg: string): Promise<void> {
    return new Promise((resolve, _) => {
      this.ws.send(msg)
      resolve()
    })
  }

  setSub(l: (msg: string) => void): Promise<void> {
    return new Promise((resolve, _) => {
      this.ws.onmessage = e => l(e.data)
      resolve()
    })
  }

  close(): Promise<void> {
    return new Promise((resolve, _) => {
      this.ws.close()
      resolve()
    })
  }
}
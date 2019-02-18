
declare module 'webrtc-adapter' {
  export var browserDetails: { browser: string }
  export var browserShim: BrowserShim | null

  export interface BrowserShim {
    shimGetDisplayMedia?(window: Window, preferredMediaSource: 'screen' | 'window'): void
  }
}

declare interface MediaDevices {
  getDisplayMedia(constraints: MediaStreamConstraints): Promise<MediaStream>
}

declare interface MediaTrackConstraints {
  cursor?: 'always' | 'motion' | 'never'
}

declare interface Gun {
  (url: string): Gun
  get(key: string): Gun
  on(cb: (data: any, key: string) => void): Gun
  off(): Gun
  put(data: any): Gun

  log: { off: boolean }
}

declare module 'gun/gun' {
  const Gun: Gun
  export default Gun
}

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
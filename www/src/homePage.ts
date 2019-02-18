import { clientUrl } from './util'

export default class HomePage {
  elem: HTMLElement

  constructor() {
    // TODO: warn on invalid os/browser
    this.elem = document.getElementById('home')!
    const phraseElem = document.getElementById('homePhrase') as HTMLInputElement
    const connectElem = document.getElementById('homeConnect') as HTMLAnchorElement
    // Handlers
    phraseElem.onkeypress = e => {
      // When phrase entered and enter pressed, go. Note, we do the full
      // href part here because I want the back button to work.
      if (e.keyCode == 13 && phraseElem.value.length >= 3) window.location.href = clientUrl(phraseElem.value)
    }
    // Update the button on input change
    phraseElem.onchange = () =>
      connectElem.href = clientUrl(phraseElem.value)
    phraseElem.oninput = () =>
      connectElem.href = clientUrl(phraseElem.value)
  }

  show() {
    this.elem.style.display = 'flex'
  }

  reset() {
    this.elem.style.display = 'none'
  }
}
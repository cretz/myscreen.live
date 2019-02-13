
export default class ClientPage {
  elem: HTMLElement

  constructor() {
    this.elem = document.getElementById('client')!
  }

  show() {
    this.elem.style.display = 'flex'
  }

  reset() {
    this.elem.style.display = 'none'
  }
}
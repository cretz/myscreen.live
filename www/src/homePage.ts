
export default class HomePage {
  elem: HTMLElement

  constructor() {
    this.elem = document.getElementById('home')!
  }

  show() {
    this.elem.style.display = 'flex'
  }

  reset() {
    this.elem.style.display = 'none'
  }
}
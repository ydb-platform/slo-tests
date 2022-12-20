export default class RateLimiter {
  private delay: number

  constructor(ratePerSecond: number) {
    this.delay = 1000 / ratePerSecond
  }

  async nextTick() {
    return new Promise((resolve) => setTimeout(resolve, this.delay))
  }
}

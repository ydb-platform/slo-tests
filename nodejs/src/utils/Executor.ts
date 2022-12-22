import { writeFile } from 'fs/promises'
import { Counter, Gauge, Summary, Registry } from 'prom-client'
import { Driver, Session } from 'ydb-sdk'
import { dependencies } from '../../package.json'

const sdkVersion = dependencies['ydb-sdk']

const percentiles = [0.5, 0.9, 0.95, 0.99, 0.999]

export default class Executor {
  private readonly driver: Driver
  private readonly registry = new Registry()
  private readonly oks: Counter
  private readonly notOks: Counter
  private readonly inflight: Gauge
  private readonly okLatencies: Summary
  private readonly notOkLatencies: Summary

  constructor(driver: Driver) {
    this.driver = driver
    this.registry.setDefaultLabels({ sdk: 'nodejs', sdkVersion })
    const registers = [this.registry]

    this.oks = new Counter({ name: 'oks', help: 'amount of OK requests', registers })
    this.notOks = new Counter({ name: 'not_oks', help: 'amount of not OK requests', registers })
    this.inflight = new Gauge({ name: 'inflight', help: 'amount of requests in flight', registers })
    this.okLatencies = new Summary({
      name: 'ok_latency',
      help: 'histogram of ok latencies in ms',
      percentiles,
      registers,
      // add more options?
    })
    this.notOkLatencies = new Summary({
      name: 'not_ok_latency',
      help: 'histogram of not ok latencies in ms',
      percentiles,
      registers,
      // add more options?
    })
  }

  withSession(jobName: string) {
    return async <T>(callback: (session: Session) => Promise<T>, timeout?: number): Promise<T> => {
      this.inflight.inc()
      let result: any
      const startSession = new Date().valueOf()
      let endSession: number
      try {
        result = await this.driver.tableClient.withSession(callback, timeout)
        endSession = new Date().valueOf()
        this.okLatencies.observe({ status: 'ok', jobName }, endSession - startSession)
        this.oks.inc()
      } catch (error) {
        endSession = new Date().valueOf()
        console.log(error)
        this.notOkLatencies.observe({ status: 'err', jobName }, endSession - startSession)
        this.notOks.inc()
      }
      this.inflight.dec()
      return result
    }
  }

  async printStats(file?: string) {
    const json = await this.registry.getMetricsAsJSON()
    if (file) {
      await writeFile(file, JSON.stringify(json))
    }
    console.log('========== Stats: ========== \n\n', json, '========== Stats end ==========')
  }
}

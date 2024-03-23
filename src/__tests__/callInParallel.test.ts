import {expect, test, beforeAll} from '@jest/globals'
import * as core from '@actions/core'
import {callAsync} from '../callExecutables'
beforeAll(() => {
  // @ts-ignore
  core.debug = () => {}
  // @ts-ignore
  core.info = () => {}
})

test('Sleep in parallel', async () => {
  const timeStart = new Date().valueOf()
  const res = await Promise.all([
    callAsync('sleep 1; echo "sleeped 1"'),
    callAsync('sleep 2; echo "sleeped 2"')
  ])
  expect(res[0]).toBe('sleeped 1\n')
  expect(res[1]).toBe('sleeped 2\n')
  expect(Math.floor((new Date().valueOf() - timeStart) / 1000)).toBe(2)
})

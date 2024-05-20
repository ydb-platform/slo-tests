import {expect, test, jest, afterEach, beforeAll} from '@jest/globals'
import * as core from '@actions/core'
import * as callExecutables from '../callExecutables'
import {
  filterGraphData,
  getDataFromGrafana,
  checkGraphValues
} from '../checkResults'

beforeAll(() => {
  // @ts-ignore
  core.debug = () => {}
  // @ts-ignore
  core.info = () => {}
})

afterEach(() => {
  jest.restoreAllMocks()
})

test('checkResults wget generation', async () => {
  const spiedСallAsync = jest
    .spyOn(callExecutables, 'callAsync')
    .mockImplementation(async (v: string) => v)
  const spiedСallKubernetesAsync = jest
    .spyOn(callExecutables, 'callKubernetesAsync')
    .mockImplementation(async (v: string) => 'kubectl ' + v)
  const spiedСallKubernetesPathAsync = jest
    .spyOn(callExecutables, 'callKubernetesPathAsync')
    .mockImplementation(async (generator: (s: string) => string) => {
      return Buffer.from(generator('kubectl'), 'utf8').toString('base64')
    })

  const res = await getDataFromGrafana(new Date(1234000), new Date(5678000), [
    {
      expr: 'expr1',
      refId: 'refId1',
      interval: '1s'
    },
    {
      expr: 'expr2',
      refId: 'refId2',
      interval: '',
      format: 'time_series'
    }
  ])

  // const requestId = res.match(/requestId":"([Q\-0-9a-zA-Z]+)"/)![1]
  const keys = [...res.matchAll(/key":"([Q\-0-9a-z]+)"/g)].map(v => v![1])

  const sample = `--post-data='\\''{
"queries": [
    {
      "requestId": "${keys.join('')}refId1",
      "refId": "refId1",
      "expr": "expr1",
      "key": "${keys[0]}",
      "interval": "1s",
      "datasource": {
        "type": "prometheus",
        "uid": "prometheus"
      },
      "editorMode": "code",
      "legendFormat": "__auto",
      "range": false,
      "instant": true,
      "exemplar": false,
      "hide": false,
      "queryType": "timeSeriesQuery",
      "utcOffsetSec": 14400,
      "datasourceId": 1,
      "intervalMs": 5000,
      "maxDataPoints": 1514
    },
    {
      "requestId": "${keys.join('')}refId2",
      "refId": "refId2",
      "expr": "expr2",
      "key": "${keys[1]}",
      "interval": "",
      "format": "time_series",
      "datasource": {
        "type": "prometheus",
        "uid": "prometheus"
      },
      "editorMode": "code",
      "legendFormat": "__auto",
      "range": false,
      "instant": true,
      "exemplar": false,
      "hide": false,
      "queryType": "timeSeriesQuery",
      "utcOffsetSec": 14400,
      "datasourceId": 1,
      "intervalMs": 5000,
      "maxDataPoints": 1514
    }
],
"range": {
  "from": "1970-01-01T00:20:34.000Z",
  "to": "1970-01-01T01:34:38.000Z",
  "raw": {
    "from": "1970-01-01T00:20:34.000Z",
    "to": "1970-01-01T01:34:38.000Z"
  }
},
"from": "1234000",
"to": "5678000"
}'\\''`.replace(/[\n ]/g, '')

  expect(res).toContain(
    'kubectl run -q -i --image=busybox --rm grafana-result-peeker'
  )
  expect(res).toContain(
    ` --restart=Never -- sh -c 'wget -q -O- --header='\\''content-type: application/json'\\'' ` +
      sample +
      ` '\\''http://grafana/api/ds/query'\\'' | base64'`
  )
})

test('filterGraphData', () => {
  const sampleFilter = filterGraphData({a: '123', b: '234'})
  expect(sampleFilter({value: 1, labels: {a: '123'}})).toBe(false)
  expect(sampleFilter({value: 1, labels: {a: '123', b: '234'}})).toBe(true)
})

test('checkGraphValues', () => {
  const checks = checkGraphValues(
    {
      abc: [{labels: {a: 'a', b: 'b', c: 'c'}, value: 15}],
      def: [
        {labels: {d: 'd', e: 'e'}, value: -10},
        {labels: {e: 'e', f: 'f'}, value: 10}
      ]
    },
    {
      abc: [
        {filter: {a: 'a', b: 'b', c: 'c'}, value: ['>', 10]},
        {filter: {}, value: ['<', 10]}
      ],
      def: [
        {filter: {e: 'e'}, value: ['<', 0]},
        {filter: {c: 'c', e: 'e'}, value: ['<', 0]}
      ],
      xyz: [{filter: {a: 'a'}, value: ['>', 0]}]
    }
  )

  expect(checks).toStrictEqual([
    ['abc{"a":"a","b":"b","c":"c"}[0]', 'ok', '15 > 10'],
    ['abc{}[0]', 'error', '15 !< 10'],
    ['def{"e":"e"}[0]', 'ok', '-10 < 0'],
    ['def{"e":"e"}[1]', 'error', '10 !< 0'],
    ['def{"c":"c","e":"e"}', 'error', 'Not found results by filter to inspect'],
    ['xyz{"a":"a"}', 'error', 'Not found results by filter to inspect']
  ])
})

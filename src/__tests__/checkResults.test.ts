import {expect, test, jest} from '@jest/globals'

// const callExecutables = jest.createMockFromModule(
//   '../callExecutables'
// ) as typeof import('../callExecutables')
// callExecutables.callKubernetesPathAsync = async generator => {
//   return generator('kubectl')
// }

jest.mock('../callExecutables', () => ({
  __esModule: true, // this property makes it work
  callKubernetesPathAsync: async (generator: (s: string) => string) => {
    return generator('kubectl')
  }
}))

import {callKubernetesPathAsync, prepareK8S} from '../callExecutables'
callKubernetesPathAsync(t => 'test')
import {getDataFromGrafana} from '../checkResults'

test('checkResults wget generation', async () => {
  expect(
    await getDataFromGrafana(new Date(1234000), new Date(5678000), [
      {
        expr: 'expr1',
        key: 'key1',
        refId: 'refId1',
        reqId: 'req1',
        interval: '1s'
      },
      {
        expr: 'expr2',
        key: 'key2',
        refId: 'refId2',
        reqId: 'req2',
        interval: '',
        format: 'time_series'
      }
    ])
  ).toStrictEqual(
    `kubectl run -q -i --image=busybox --rm grafana-result-peeker --restart=Never -- sh -c '` +
      `wget -q -O- --header='\\''content-type: application/json'\\'' ` +
      `--post-data='\\''{
    "queries": [
        {
          "refId": "refId1",
          "expr": "expr1",
          "key": "key1",
          "requestId": "req1",
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
          "refId": "refId2",
          "expr": "expr2",
          "key": "key2",
          "requestId": "req2",
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
    "from": 1234000,
    "to": 5678000
  }'\\''`.replace(/[\n ]/g, '') +
      ` '\\''http://grafana/api/ds/query'\\'' | base64'`
  )
})

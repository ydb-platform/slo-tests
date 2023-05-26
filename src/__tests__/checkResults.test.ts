import * as core from '@actions/core'

beforeAll(() => {
  // @ts-ignore
  core.debug = () => {}
  // @ts-ignore
  core.info = () => {}
})

import {getDataFromGrafana} from '../checkResults'

test('checkResults wget generation', async () => {
  const res = await getDataFromGrafana(new Date(1234000), new Date(5678000), [
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
"from": 1234000,
"to": 5678000
}'\\''`.replace(/[\n ]/g, '')

  expect(res).toStrictEqual(
    `kubectl run -q -i --image=busybox --rm grafana-result-peeker --restart=Never -- sh -c '` +
      `wget -q -O- --header='\\''content-type: application/json'\\'' ` +
      sample +
      ` '\\''http://grafana/api/ds/query'\\'' | base64'`
  )
})

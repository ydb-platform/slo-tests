import crypto from 'crypto'
import {callKubernetesPathAsync} from './callExecutables'

interface IGrafanaQuery {
  refId: string
  expr: string
  reqId: string
  key: string
  interval: '1s' | ''
  format?: 'time_series'
}

export function getUUID() {
  const hexstring = crypto.randomBytes(16).toString('hex')
  return (
    hexstring.substring(0, 8) +
    '-' +
    hexstring.substring(8, 12) +
    '-' +
    hexstring.substring(12, 16) +
    '-' +
    hexstring.substring(16, 20) +
    '-' +
    hexstring.substring(20)
  )
}

export function getDataFromGrafana(
  fromDate: Date,
  toDate: Date,
  queries: IGrafanaQuery[]
) {
  const data = {
    queries: queries.map((q, i) => ({
      refId: q.refId,
      expr: q.expr,
      key: `Q-${getUUID()}-${i}`,
      // requestId: `Q-${getUUID()}-${i}`,
      interval: q.interval,
      ...(q.format ? {format: q.format} : {}),
      datasource: {
        type: 'prometheus',
        uid: 'prometheus'
      },
      editorMode: 'code',
      legendFormat: '__auto',
      range: false,
      instant: true,
      exemplar: false,
      hide: false,
      queryType: 'timeSeriesQuery',
      utcOffsetSec: 14400,
      datasourceId: 1,
      intervalMs: 5000,
      maxDataPoints: 1514
    })),
    range: {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      raw: {
        from: fromDate.toISOString(),
        to: toDate.toISOString()
      }
    },
    from: fromDate.valueOf(),
    to: toDate.valueOf()
  }

  let requestId = data.queries.reduce((acc, v) => (acc += v.key), '')
  data.queries = data.queries.map(q => ({
    requestId: `${requestId}${q.refId}`,
    ...q
  }))

  let busyboxCmd = `wget -q -O- --header='content-type: application/json' --post-data='${JSON.stringify(
    data
  )}' 'http://grafana/api/ds/query' | base64`

  busyboxCmd = busyboxCmd.replace(/'/g, "'\\''")

  return callKubernetesPathAsync(
    kubectl =>
      `${kubectl} run -q -i --image=busybox --rm grafana-result-peeker --restart=Never -- sh -c '${busyboxCmd}'`
  )
}

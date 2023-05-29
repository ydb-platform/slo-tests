import crypto from 'crypto'
import * as core from '@actions/core'
import * as github from '@actions/github'
import {GitHub} from '@actions/github/lib/utils'
import {callKubernetesPathAsync} from './callExecutables'
import {retry} from './utils/retry'

export interface IGrafanaQuery {
  refId: string
  expr: string
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

export async function getDataFromGrafana(
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
    from: '' + fromDate.valueOf(),
    to: '' + toDate.valueOf()
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

  core.debug(
    `getDataFromGrafana kube request:\nkubectl run -q -i --image=busybox --rm grafana-result-peeker --restart=Never -- sh -c '${busyboxCmd}'`
  )

  return Buffer.from(
    await callKubernetesPathAsync(
      kubectl =>
        `${kubectl} run -q -i --image=busybox --rm grafana-result-peeker-${Math.ceil(
          (Math.random() * 1000) % 1000
        )} --restart=Never -- sh -c '${busyboxCmd}'`
    ),
    'base64'
  ).toString('utf8')
}

interface IParsedResult {
  value: number
  labels: {
    [key: string]: string
  }
}
export interface IParsedResults {
  [queryName: string]: IParsedResult[]
}

interface IDesiredResult {
  filter: {[label: string]: string}
  value: ['>' | '<', number]
}
export interface IDesiredResults {
  [queryName: keyof IParsedResults]: IDesiredResult[]
}

export function parseRawGraph(dataString: string) {
  const data = JSON.parse(dataString)
  core.debug('Parsed JSON graph data ' + JSON.stringify(data))
  const keys = Object.keys(data.results)
  core.debug('Process graph data')
  return keys.reduce((acc, k) => {
    acc[k] = data.results[k].frames.map((f: any) => ({
      value: f?.data?.values?.[1]?.[0],
      labels: f?.schema?.fields?.[1]?.labels
    }))
    return acc
  }, {} as IParsedResults)
}

export function filterGraphData(filter: IDesiredResult['filter']) {
  return function filterGraphFun(result: IParsedResult) {
    return Object.entries(filter).reduce((prev, filt) => {
      return prev && result.labels[filt[0]] === filt[1]
    }, true)
  }
}

export function checkGraphValues(
  workloadId: string,
  realResults: IParsedResults,
  desiredResults: IDesiredResults
) {
  // let results: {[k: keyof IDesiredResults]: {decision: boolean; text: string}[]}
  let checks: [
    key: string,
    decision: 'ok' | 'error' | 'notfound',
    text: string
  ][] = []
  for (const queryName of Object.keys(desiredResults)) {
    const result = realResults[queryName]
    const desired = desiredResults[queryName]

    for (const desiredRes of desired) {
      const filter = {job: `workload-${workloadId}`, ...desiredRes.filter}
      let inspected = (result || []).filter(filterGraphData(filter))
      const checkName = `${queryName}${JSON.stringify(filter)}`
      if (inspected.length === 0) {
        checks.push([
          checkName,
          'notfound',
          `Not found results by filter to inspect`
        ])
      } else {
        for (const [i, inspectedRes] of Object.entries(inspected)) {
          const decision =
            desiredRes.value[0] === '>'
              ? inspectedRes.value > desiredRes.value[1]
              : inspectedRes.value < desiredRes.value[1]

          checks.push([
            `${checkName}[${i}]`,
            decision ? 'ok' : 'error',
            `${inspectedRes.value} ${decision ? '' : '!'}${
              desiredRes.value[0]
            } ${desiredRes.value[1]}`
          ])
        }
      }
    }
  }
  return checks
}

export async function checkResults(
  octokit: InstanceType<typeof GitHub>,
  workloadId: string,
  fromDate: Date,
  toDate: Date,
  desiredResults: IDesiredResults,
  queries?: IGrafanaQuery[]
) {
  core.info('Check results')
  core.debug(
    `Check results (${fromDate}, ${toDate}, ${JSON.stringify(queries)})`
  )
  if (!queries)
    queries = [
      {
        refId: 'success_rate',
        expr: 'max_over_time(oks[$__range])/(0.0001+max_over_time(not_oks[$__range])+max_over_time(oks[$__range]))>0',
        interval: '1s'
      },
      {
        refId: 'max_99_latency',
        expr: 'max_over_time(latency{quantile="0.99"}[$__range])>0',
        interval: ''
      },
      {
        refId: 'fail_interval',
        expr: 'sum_over_time(clamp(irate(not_oks[2s])*2, 0, 1)[$__range:1s])>0',
        interval: '1s'
      }
    ]

  const parsed = await retry(2, async () => {
    const graphsRaw = await getDataFromGrafana(fromDate, toDate, queries!)
    core.debug('graphsRaw: ' + graphsRaw)
    return parseRawGraph(graphsRaw)
  })

  core.debug('parsed: ' + JSON.stringify(parsed))
  const checks = checkGraphValues(workloadId, parsed, desiredResults)

  for (let i = 0; i < checks.length; i++) {
    const conclusion =
      checks[i][1] === 'error'
        ? 'failure'
        : checks[i][1] === 'notfound'
        ? 'neutral'
        : 'success'
    const checkParams = {
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      name: `slo_check_${checks[i][0]}`,
      head_sha: github.context.sha,
      status: 'completed',
      conclusion: conclusion,
      output: {
        title: `SLO results check #${0}`,
        summary: checks[i][2],
        text: checks[i][2]
      }
    }

    await octokit.rest.checks.create(checkParams)
  }
  return checks.filter(ch => ch[1] == 'error').length > 0
}

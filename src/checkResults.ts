import crypto from 'crypto'
import * as core from '@actions/core'
import * as github from '@actions/github'
import {GitHub} from '@actions/github/lib/utils'
import {callKubernetesPathAsync} from './callExecutables'
import {retry} from './utils/retry'
import {
  RestEndpointMethodTypes
} from "@octokit/plugin-rest-endpoint-methods/dist-types/generated/parameters-and-response-types";

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
    title: string,
    text: string
  ][] = []
  for (const queryName of Object.keys(desiredResults)) {
    const result = realResults[queryName]
    const desired = desiredResults[queryName]
    core.debug(
      `Check query '${queryName}': result: ${JSON.stringify(
        result
      )}; desired result:${JSON.stringify(desired)}`
    )

    for (const desiredRes of desired) {
      const filter = {job: `workload-${workloadId}`, ...desiredRes.filter}
      let inspected = (result || []).filter(filterGraphData(filter))
      core.debug(
        `Apply filter '${JSON.stringify(filter)}': ${JSON.stringify(inspected)}`
      )
      const checkName = `${queryName}${JSON.stringify(filter)}`
      const checkId = `slo-${checkName.replace(/[{":}\[\]]/g, '-')}`

      if (inspected.length === 0) {
        core.debug(`Not found results by filter to inspect`)
        checks.push([
          checkId,
          'notfound',
          checkName,
          `Not found results by filter to inspect`
        ])
      } else {
        core.debug(
          `Found results by filter to inspect: ${JSON.stringify(
            Object.entries(inspected)
          )}`
        )
        for (const [i, inspectedRes] of Object.entries(inspected)) {
          const decision =
            desiredRes.value[0] === '>'
              ? inspectedRes.value > desiredRes.value[1]
              : inspectedRes.value < desiredRes.value[1]

          core.debug(
            `Inspection '${checkName}[${i}]' (${inspectedRes.value} ${desiredRes.value[0]} ${desiredRes.value[1]}) result: ${decision}`
          )
          checks.push([
            `${checkId}-${i}`,
            decision ? 'ok' : 'error',
            checkName,
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
  core.info('checks: ' + JSON.stringify(checks))

  let failed = false
  let failedMsg = 'SLO check failed: '
  for (let i = 0; i < checks.length; i++) {
    if (checks[i][1] === 'error') {
      failed = true
      failedMsg += `${checks[i][2]}: ${checks[i][3]}`
    }
    try {
      // try to add to checks
      const conclusion =
        checks[i][1] === 'error'
          ? 'failure'
          : checks[i][1] === 'notfound'
          ? 'neutral'
          : 'success'
      const checkParams: RestEndpointMethodTypes["checks"]["create"]["parameters"] = {
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        name: `slo-check-${i}`,
        head_sha: github.context.sha,
        status: 'completed',
        conclusion: conclusion,
        started_at: fromDate.toISOString(),
        output: {
          title: `SLO check ${i}`,
          summary: checks[i][3],
          text: checks[i][3]
        }
      }

      core.info('create check: ' + JSON.stringify(checkParams))
      core.info(
        'Create check response: ' +
          JSON.stringify(await octokit.rest.checks.create(checkParams))
      )
    } catch (error) {
      core.info('Create check error: ' + JSON.stringify(error))
    }
  }
  if (failed) {
    core.setFailed(failedMsg)
  }
  return checks.filter(ch => ch[1] == 'error').length > 0
}

import path from 'path'
import * as core from '@actions/core'
import {context} from '@actions/github'
import {GitHub} from '@actions/github/lib/utils'
import {callAsync, callKubernetesAsync} from './callExecutables'

export async function grafanaScreenshot(
  s3Endpoint: string,
  s3Folder: string,
  workloadId: string,
  startTime: Date,
  endTime: Date,
  dashboard = '7CzMl5t4k',
  width = 1500,
  height = 1100
) {
  core.debug(
    `grafanaScreenshot(${s3Endpoint}, ${s3Folder}, ${workloadId}, ${startTime}, ${endTime}, ${dashboard}, ${width}, ${height})`
  )
  const query = `http://grafana/render/d/${
    dashboard.split('/')[0]
  }/slo?orgId=1&from=${startTime.valueOf()}&to=${endTime.valueOf()}&width=${width}&height=${height}&tz=Europe%2FIstanbul&kiosk=tv`
  core.debug('grafana query: ' + query)
  const imageb64 = await callKubernetesAsync(
    `run -q -i --image=busybox --rm grafana-screenshoter --restart=Never -- sh -c "wget -q -O- '${query}' | base64"`
  )
  core.debug(
    'grafana imageb64: ' +
      imageb64.slice(0, 100) +
      '...TRUNCATED...' +
      imageb64.slice(-100)
  )
  // write image to fs
  await callAsync(`echo "${imageb64}" | base64 --decode > pic.png`)

  const pictureName = `${workloadId}-${new Date().valueOf()}.png`
  // upload

  await callAsync(
    `aws s3 --endpoint-url=${s3Endpoint} cp ./pic.png "s3://${path.join(
      s3Folder,
      pictureName
    )}"`
  )
  // delete
  await callAsync(`rm pic.png`)
  // return name
  const fullPictureUri = path.join(s3Endpoint, s3Folder, pictureName)
  core.debug('fullPictureUri: ' + fullPictureUri)
  return `${fullPictureUri}`
}

export async function postComment(
  octokit: InstanceType<typeof GitHub>,
  id: number,
  message: string
) {
  if (!context.payload.pull_request) return
  const data = {
    ...context.repo,
    issue_number: context.payload.pull_request.number,
    comment_id: id,
    body: message
  }
  try {
    await octokit.rest.issues.createComment(data)
  } catch (error) {
    await octokit.rest.issues.updateComment(data)
  }
}

import path from 'path'
import * as core from '@actions/core'
import {context} from '@actions/github'
import {GitHub} from '@actions/github/lib/utils'
import {callAsync, callKubernetesAsync} from './callExecutables'
import {writeFile} from 'fs/promises'

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
  }/slo?orgId=1&from=${startTime.valueOf()}&to=${endTime.valueOf()}&width=${width}&height=${height}&tz=Europe%2FIstanbul&kiosk=tv&var-filter=job|=|workload-${workloadId}`
  core.debug('grafana query: ' + query)
  const imageb64 = await core.group('Get base64 image', () =>
    callKubernetesAsync(
      `run -q -i --image=busybox --rm grafana-screenshoter-${workloadId} --restart=Never -- sh -c "wget -q -O- '${query}' | base64"`
    )
  )
  core.debug(
    'grafana imageb64: ' +
      imageb64.slice(0, 100) +
      '...TRUNCATED...' +
      imageb64.slice(-100)
  )
  core.debug('Write picture to FS')

  const fileName = `${workloadId}-${new Date().valueOf()}.png`

  // write image to fs
  await writeFile(fileName, Buffer.from(imageb64, 'base64'))

  // upload
  await callAsync(
    `aws s3 --endpoint-url=${s3Endpoint} cp ./${fileName} "s3://${path.join(
      s3Folder,
      fileName
    )}"`
  )

  // delete
  await callAsync(`rm ${fileName}`)

  // return name
  const fullPictureUri =
    'https://' + path.join(s3Endpoint.split('//')[1], s3Folder, fileName)
  core.debug('fullPictureUri: ' + fullPictureUri)
  return `${fullPictureUri}`
}

export async function postComment(
  octokit: InstanceType<typeof GitHub>,
  id: number,
  message: string
) {
  if (!context.payload.pull_request) return
  const commentTag = `<!-- slo-test-action "${id}" -->`

  const commentsList = await octokit.rest.issues.listComments({
    issue_number: context.payload.pull_request.number,
    ...context.repo
  })
  const oldComment = commentsList.data.filter(comment =>
    comment.body?.includes(commentTag)
  )

  if (oldComment.length === 0) {
    const data = {
      ...context.repo,
      issue_number: context.payload.pull_request.number,
      comment_id: id,
      body: message + `\n${commentTag}`
    }
    core.debug('Create comment with data:' + JSON.stringify(data))
    const res = await octokit.rest.issues.createComment(data)
    core.debug('Create comment result:' + JSON.stringify(res))
  } else {
    const data = {
      ...context.repo,
      comment_id: oldComment[0].id,
      body: message + `\n${commentTag}`
    }
    core.debug('Update comment with data:' + JSON.stringify(data))
    const res = await octokit.rest.issues.updateComment(data)
    core.debug('Update comment result:' + JSON.stringify(res))
  }
}

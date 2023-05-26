import {expect, test, jest, afterEach, beforeAll} from '@jest/globals'
import * as core from '@actions/core'

import * as callExecutables from '../callExecutables'
import * as withTimeoutUtils from '../utils/withTimeout'
import {runWorkload} from '../workload'

beforeAll(() => {
  // @ts-ignore
  core.debug = () => {}
  // @ts-ignore
  core.info = () => {}
  // @ts-ignore
  core.startGroup = () => {}
  // @ts-ignore
  core.endGroup = () => {}
})

afterEach(() => {
  jest.restoreAllMocks()
})

test('Workload `create` command generation', async () => {
  const params = {
    args: 'my test arguments',
    dockerPath: 'reg.exmpl/org/image',
    id: 'test_create_id',
    timeoutMins: 3
  }
  let counter = 0
  const spiedCheck = jest
    .spyOn(callExecutables, 'callKubernetesAsync')
    .mockImplementation(async (v: string) => {
      if (v.indexOf(`-o=jsonpath={.status}`) > -1) {
        counter++
        if (counter < 3) return '{"active": 1, "ready": 0}'
        else return '{"complete": 1}'
      } else return v
    })
  let createCall = ''
  const spiedCreate = jest
    .spyOn(callExecutables, 'callKubernetesPathAsync')
    .mockImplementation(async generator => {
      createCall = generator('kubectl')
      return generator('kubectl')
    })

  // remove waiting to speed up tests
  const originalWithTimeout = withTimeoutUtils.withTimeout
  const spiedWithTimeout = jest
    .spyOn(withTimeoutUtils, 'withTimeout')
    .mockImplementation((timeout, _, actionName, checkFunc) =>
      originalWithTimeout(timeout, 0.1, actionName, checkFunc)
    )

  await runWorkload('create', params)
  expect(spiedCheck).toBeCalledWith(
    'get job/test_create_id-wl-create -o=jsonpath={.status}'
  )
  expect(spiedCheck).toBeCalledTimes(4)
  expect(spiedCreate).toBeCalledTimes(1)
  expect(createCall).toStrictEqual(`kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: ${params.id}-wl-create
spec:
  ttlSecondsAfterFinished: 120
  backoffLimit: 0
  template:
    metadata:
      name: ${params.id}-wl-create
    spec:
      containers:
        - name: ${params.id}-wl-create
          image: ${params.dockerPath}:latest
          args:
            - 'create'
            - 'grpc://database-sample-grpc:2135'
            - '/root/database-sample'
            - '--table-name'
            - 'slo-test_create_id'
            - 'my'
            - 'test'
            - 'arguments'
      restartPolicy: Never

EOF`)
})

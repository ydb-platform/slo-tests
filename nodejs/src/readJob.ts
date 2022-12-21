import { Driver, ExecuteQuerySettings, OperationParams, TypedData, TypedValues } from 'ydb-sdk'

import { TABLE_NAME, READ_RPS, READ_TIMEOUT, READ_TIME } from './utils/defaults'
import RateLimiter from './utils/RateLimiter'
import { randomId } from './utils/DataGenerator'

export async function readJob(
  driver: Driver,
  tableName?: string,
  readRPS?: number,
  readTimeout?: number,
  time?: number
) {
  if (!tableName) tableName = TABLE_NAME
  if (!readRPS) readRPS = READ_RPS
  if (!readTimeout) readTimeout = READ_TIMEOUT
  if (!time) time = READ_TIME

  const rateLimiter = new RateLimiter(readRPS)
  let maxId = await getMaxId(driver, tableName)
  console.log('Max id', { maxId })
  // maxId = Math.round(maxId * 1.25)
  await read(driver, rateLimiter, maxId, tableName, new Date().valueOf() + time * 1000)

  process.exit(0)
}

async function getMaxId(driver: Driver, tableName: string): Promise<number> {
  return new Promise((resolve) => {
    driver.tableClient.withSession(async (session) => {
      const res = await session.executeQuery(
        `SELECT MAX(object_id) as max_id FROM \`${tableName}\``
      )
      const result = TypedData.createNativeObjects(res.resultSets[0])
      resolve(result[0].maxId)
    })
  })
}

async function read(
  driver: Driver,
  rl: RateLimiter,
  maxId: number,
  tableName: string,
  stopTime: number
) {
  console.log('Read with params', { maxId, tableName, stopTime })
  // PRAGMA TablePathPrefix(" + dbName + ");
  const query = `--!syntax_v1
    DECLARE $object_id_key AS Uint32;
    DECLARE $object_id AS Uint32;
    SELECT * FROM \`${tableName}\`
    WHERE object_id_key = $object_id_key AND object_id = $object_id;`

  const operationParams = new OperationParams()
    .withOperationTimeout({ nanos: 50 * 1000 * 1000 })
    .withAsyncMode()
  const txControl = { commitTx: true, beginTx: { onlineReadOnly: {} } }
  const settings = new ExecuteQuerySettings()
    .withKeepInCache(true)
    .withOperationParams(operationParams)
  const startTime = new Date()
  let counter = 0
  while (new Date().valueOf() < stopTime) {
    // TODO: add executor
    const id = randomId(maxId)
    const queryParams = {
      $object_id_key: TypedValues.uint32(id),
      $object_id: TypedValues.uint32(id),
    }
    console.log('id', id)
    counter++
    await rl.nextTick()

    driver.tableClient.withSession(async (session) => {
      console.log(JSON.stringify((await session.executeQuery(query, queryParams, txControl, settings)).resultSets[0].rows))
    })
  }
  const endTime = new Date()
  const diffTime = (endTime.valueOf() - startTime.valueOf()) / 1000
  console.log({ counter, diffTime, rps: counter / diffTime })
  console.log('Read job done')
}

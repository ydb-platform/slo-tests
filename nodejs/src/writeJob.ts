import { Driver, ExecuteQuerySettings, OperationParams, TypedData, TypedValues } from 'ydb-sdk'

import { TABLE_NAME, WRITE_RPS, WRITE_TIMEOUT, WRITE_TIME } from './utils/defaults'
import RateLimiter from './utils/RateLimiter'
import { DataGenerator, randomId } from './utils/DataGenerator'

export async function writeJob(
  driver: Driver,
  tableName?: string,
  rps?: number,
  timeout?: number,
  time?: number
) {
  if (!tableName) tableName = TABLE_NAME
  if (!rps) rps = WRITE_RPS
  if (!timeout) timeout = WRITE_TIMEOUT
  if (!time) time = WRITE_TIME

  const rateLimiter = new RateLimiter(rps)
  let maxId = await getMaxId(driver, tableName)
  console.log('Max id', { maxId })
  // maxId = Math.round(maxId * 1.25)
  await write(driver, rateLimiter, maxId, tableName, new Date().valueOf() + time * 1000, timeout)
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

async function write(
  driver: Driver,
  rl: RateLimiter,
  maxId: number,
  tableName: string,
  stopTime: number,
  timeout: number
) {
  console.log('Write with params', { maxId, tableName, stopTime })

  const query = `--!syntax_v1
    DECLARE $items AS
    List<Struct<
    object_id_key: Uint32,
    object_id: Uint32,
    timestamp: Uint64,
    payload: Utf8>>;
    UPSERT INTO \`${tableName}\`
    SELECT * FROM AS_TABLE($items);`

  const valueGenerator = new DataGenerator(maxId)

  const settings = new ExecuteQuerySettings().withKeepInCache(true).withOperationParams(
    new OperationParams().withOperationTimeout({
      nanos: timeout * 1000 * 1000,
    })
  )

  const startTime = new Date()
  let counter = 0
  while (new Date().valueOf() < stopTime) {
    // TODO: add executor
    counter++
    await rl.nextTick()

    driver.tableClient.withSession(async (session) => {
      await session.executeQuery(
        query,
        { $items: TypedData.asTypedCollection([valueGenerator.get()]) },
        { commitTx: true, beginTx: { serializableReadWrite: {} } },
        settings
      )
    })
  }
  const endTime = new Date()
  const diffTime = (endTime.valueOf() - startTime.valueOf()) / 1000
  console.log({ counter, diffTime, rps: counter / diffTime })
  console.log('Write job done')
}

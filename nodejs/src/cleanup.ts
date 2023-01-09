import { join } from 'path'
import { Driver } from 'ydb-sdk'
import { TABLE_NAME } from './utils/defaults'

export async function cleanup(driver: Driver, db: string, tableName?: string) {
  if (!tableName) tableName = TABLE_NAME
  tableName = join(db, tableName)

  console.log('Drop table', { task: 'dropTable', tableName })
  await driver.tableClient.withSession(async (session) => {
    await session.dropTable(tableName!)
  })
  console.log('Table successfully dropped')
  process.exit(0)
}

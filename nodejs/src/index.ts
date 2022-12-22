import { program } from 'commander'
import { Driver, getCredentialsFromEnv } from 'ydb-sdk'
import { cleanup } from './cleanup'
import { create } from './create'
import { readJob } from './readJob'
import { TABLE_NAME } from './utils/defaults'
import Executor from './utils/Executor'
import { getMaxId } from './utils/getMaxId'
import { writeJob } from './writeJob'

const defaultArgs = (p: typeof program) => {
  return p
    .argument('<endpoint>', 'YDB endpoint to connect to')
    .argument('<db>', 'YDB database to connect to')
}

async function createDriver(endpoint: string, database: string): Promise<Driver> {
  const authService = getCredentialsFromEnv()
  console.log('Driver initializing...')
  const logFunction = (lvl: string, suppress: boolean = false) => {
    return (msg: string, ...args: any[]) =>
      !suppress && console.log(`[${new Date().toISOString()}] ${lvl} ${msg}`, args)
  }
  const logger = {
    trace: logFunction('trace', true),
    debug: logFunction('debug'),
    fatal: logFunction('fatal'),
    error: logFunction('error'),
    warn: logFunction('warn'),
    info: logFunction('info'),
  }
  const driver = new Driver({
    endpoint,
    database,
    authService,
    poolSettings: { minLimit: 10 },
    // logger,
  })

  const timeout = 30000
  if (!(await driver.ready(timeout))) {
    console.log(`Driver has not become ready in ${timeout}ms!`)
    process.exit(1)
  }
  console.log('Initialized succesfully')
  return driver
}

interface ICreateOptions {
  tableName?: string
  partitionCount?: string
  initialDataCount?: string
}

function main() {
  program
    .name('slo-nodejs-workload')
    .description('Node.js util to run SLO workload over YDB cluster. Uses credentials from env.')

  // create
  defaultArgs(program.command('create'))
    .option('-t --table-name <tableName>', 'table name to create')
    .option('-p --partitions-count <partitionCount>', 'amount of partitions in table creation')
    .option('-c --initial-data-count <initialDataCount>', 'amount of initially created rows')
    .action(
      async (endpoint, db, { tableName, partitionCount, initialDataCount }: ICreateOptions) => {
        console.log('Run create over', endpoint, db, tableName, partitionCount, initialDataCount)

        create(await createDriver(endpoint, db), tableName, partitionCount, initialDataCount)
      }
    )

  defaultArgs(program.command('cleanup'))
    .option('-t --table-name <tableName>', 'table name to create')
    .action(async (endpoint, db, { tableName }) => {
      console.log('Run cleanup over', endpoint, db, tableName)
      cleanup(await createDriver(endpoint, db), tableName)
    })

  defaultArgs(program.command('run'))
    .option('-t --table-name <tableName>', 'table name to read from')
    .option('--read-rps <readRPS>', 'read RPS')
    .option('--read-timeout <readTimeout>', 'read timeout milliseconds')
    .option('--write-rps <writeRPS>', 'write RPS')
    .option('--write-timeout <writeTimeout>', 'write timeout milliseconds')
    .option('--time <time>', 'read time in seconds')
    .action(
      async (endpoint, db, { tableName, readRPS, readTimeout, writeRPS, writeTimeout, time }) => {
        if (!tableName) tableName = TABLE_NAME
        console.log('Run workload over', endpoint, db, tableName)

        const driver = await createDriver(endpoint, db)
        const maxId = await getMaxId(driver, tableName)
        console.log('Max id', { maxId })
        const executor = new Executor(driver)

        await Promise.all([
          readJob(executor, tableName, maxId, readRPS, readTimeout, time),
          writeJob(executor, tableName, maxId, writeRPS, writeTimeout, time),
        ])
        await executor.printStats('runStats.json')
        process.exit(0)
      }
    )

  program.parse()
}

main()

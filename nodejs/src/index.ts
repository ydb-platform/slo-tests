import { program } from 'commander'
import { Driver, getCredentialsFromEnv } from 'ydb-sdk'
import { cleanup } from './cleanup'
import { create } from './create'
import { MetricsJob } from './metricsJob'
import { readJob } from './readJob'
import { TABLE_NAME, SHUTDOWN_TIME, PROMETHEUS_PUSH_GATEWAY } from './utils/defaults'
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
  partitionsCount?: string
  initialDataCount?: string
}

function main() {
  program
    .name('slo-nodejs-workload')
    .description('Node.js util to run SLO workload over YDB cluster. Uses credentials from env.')

  // create
  defaultArgs(program.command('create'))
    .option('-t --table-name <tableName>', 'table name to create')
    .option('-p --partitions-count <partitionsCount>', 'amount of partitions in table creation')
    .option('-c --initial-data-count <initialDataCount>', 'amount of initially created rows')
    .action(
      async (endpoint, db, { tableName, partitionsCount, initialDataCount }: ICreateOptions) => {
        console.log('Run create over', endpoint, db, {
          tableName,
          partitionsCount,
          initialDataCount,
        })
        await create(
          await createDriver(endpoint, db),
          db,
          tableName,
          partitionsCount,
          initialDataCount
        )
      }
    )

  defaultArgs(program.command('cleanup'))
    .option('-t --table-name <tableName>', 'table name to create')
    .action(async (endpoint, db, { tableName }) => {
      console.log('Run cleanup over', endpoint, db, { tableName })
      await cleanup(await createDriver(endpoint, db), db, tableName)
    })

  defaultArgs(program.command('run'))
    .option('-t --table-name <tableName>', 'table name to read from')
    .option('--prom-pgw <pushGateway>', 'prometheus push gateway')
    .option('--read-rps <readRps>', 'read RPS')
    .option('--read-timeout <readTimeout>', 'read timeout milliseconds')
    .option('--write-rps <writeRps>', 'write RPS')
    .option('--write-timeout <writeTimeout>', 'write timeout milliseconds')
    .option('--time <time>', 'run time in seconds')
    .option('--shutdown-time <shutdownTime>', 'graceful shutdown time in seconds')
    .action(
      async (
        endpoint,
        db,
        { tableName, readRps, readTimeout, writeRps, writeTimeout, time, shutdownTime, pushGateway }
      ) => {
        if (!tableName) tableName = TABLE_NAME
        if (!shutdownTime) shutdownTime = SHUTDOWN_TIME
        if (!pushGateway) pushGateway = PROMETHEUS_PUSH_GATEWAY
        console.log('Run workload over', {
          tableName,
          readRps,
          readTimeout,
          writeRps,
          writeTimeout,
          time,
          shutdownTime,
          pushGateway,
        })

        const driver = await createDriver(endpoint, db)
        const maxId = await getMaxId(driver, tableName)
        console.log('Max id', { maxId })
        const executor = new Executor(driver, pushGateway)
        const metricsJob = new MetricsJob(executor, 1000, time + shutdownTime)

        await executor.printStats()
        await executor.pushStats()
        await Promise.all([
          readJob(executor, tableName, maxId, readRps, readTimeout, time),
          writeJob(executor, tableName, maxId, writeRps, writeTimeout, time),
          metricsJob,
        ])
        await new Promise((resolve) => setTimeout(resolve, shutdownTime * 1000))
        await executor.pushStats()
        await executor.printStats('runStats.json')
        console.log('Reset metrics')
        await executor.resetStats()
        await executor.pushStats()
        process.exit(0)
      }
    )

  program.parse()
}

main()

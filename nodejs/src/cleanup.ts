import { Driver, getCredentialsFromEnv } from 'ydb-sdk'

export async function cleanup(driver: Driver) {
  process.exit(0)
}

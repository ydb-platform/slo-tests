// YDB Static node configuration. Prefere do not edit. If you change it, modify configs/ydb.yaml.
export const YDB_GRPC_PORT = 2135
export const YDB_MON_PORT = 8765
export const YDB_IC_PORT = 19001
export const YDB_TENANT = "/Root/testdb"

// Pass into workload
export const YDB_ENDPOINT = `grpc://localhost:${YDB_GRPC_PORT}`
export const YBD_CONNECTION_STRING = `${YDB_ENDPOINT}${YDB_TENANT}`

export const PROMETHEUS_URL = "http://localhost:9090"
export const PROMETHEUS_PUSHGATEWAY_URL = "http://localhost:9091"

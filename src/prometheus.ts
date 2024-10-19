import type { Chart } from "./chart"
import { PROMETHEUS_URL } from "./constants"

export type PrometheusQueryRangeResponse = {
    "status": "success" | "error",
    "data": {
        "resultType": "matrix" | "vector" | "scalar" | "string",
        "result": Chart
    },
    "warnings": string[],
    "infos": string[],
    "error": string,
}

function queryRange(query: string, start: Date, end: Date) {
    let url = new URL("/api/v1/query_range", PROMETHEUS_URL)
    url.searchParams.set("query", query)
    url.searchParams.set("start", Math.ceil(start.getTime() / 1000).toString())
    url.searchParams.set("end", Math.floor(end.getTime() / 1000).toString())
    url.searchParams.set("step", "1")

    return fetch(url).then(r => r.json()) as Promise<PrometheusQueryRangeResponse>
}

const AVAILABILITY = (op: string) => /** PromQL */ `100 * sum by (ref) (increase(sdk_operations_success_total{operation_type="${op}"}[2s])) / sum by (ref) (increase(sdk_operations_total{operation_type="${op}"}[2s]))`
const THROUGHPUT = (op: string) => /** PromQL */ `sum by (ref) (rate(sdk_operations_total{operation_type="${op}"}[2s]))`
const LATENCY = (op: string) => /** PromQL */ `1000 * histogram_quantile(0.95, sum by(ref, le) (rate(sdk_operation_latency_seconds_bucket{operation_type="${op}"}[2s])))`

enum OperationType {
    read = "read",
    write = "write",
}

export type WellknownMetrics = {
    availabilityRead: Chart[number]
    availabilityWrite: Chart[number]
    throughputRead: Chart[number]
    throughputWrite: Chart[number]
    latencyRead: Chart[number]
    latencyWrite: Chart[number]
}

export async function collectPrometheus(start: Date, end: Date): Promise<WellknownMetrics> {
    const availabilityRead = await queryRange(AVAILABILITY(OperationType.read), start, end)
    const availabilityWrite = await queryRange(AVAILABILITY(OperationType.write), start, end)

    const throughputRead = await queryRange(THROUGHPUT(OperationType.read), start, end)
    const throughputWrite = await queryRange(THROUGHPUT(OperationType.write), start, end)

    const latencyRead = await queryRange(LATENCY(OperationType.read), start, end)
    const latencyWrite = await queryRange(LATENCY(OperationType.write), start, end)

    return {
        availabilityRead: availabilityRead.data.result[0],
        availabilityWrite: availabilityWrite.data.result[0],
        throughputRead: throughputRead.data.result[0],
        throughputWrite: throughputWrite.data.result[0],
        latencyRead: latencyRead.data.result[0],
        latencyWrite: latencyWrite.data.result[0],
    }
}

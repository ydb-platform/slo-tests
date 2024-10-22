import { renderChart, type WellknownCharts } from "./chart";

export async function createReport(charts: WellknownCharts): Promise<string> {
    return `# SLO Testing <img align="right" height="36" src="https://img.shields.io/badge/⎇-head-%23FF7F0E?style=for-the-badge"><img align="right" height="36"  src="https://img.shields.io/badge/⎇-base-%231F77B4?style=for-the-badge"><img align="right" height="36" src="https://img.shields.io/badge/sdk-go--native--query-%23E377C2?style=for-the-badge">

<details><summary>Operation Success Rate</summary>
${renderChart("operation_type=read", charts.availabilityRead)}

${renderChart("operation_type=write", charts.availabilityWrite)}
</details>

<details><summary>Operations Per Second</summary>
${renderChart("operation_type=read", charts.throughputRead)}

${renderChart("operation_type=write", charts.throughputWrite)}
</details>

<details><summary>95th Percentile Latency</summary>
${renderChart("operation_type=read", charts.latencyRead)}

${renderChart("operation_type=write", charts.latencyWrite)}
</details>
`
}

import { palette as defaultPalette } from "./colors";

type Series = {
    "metric": Record<string, string>,
    "values": [number, string][] // [timestamp (sec), value (float)]
}

export type Chart = Series[]

export type WellknownCharts = {
    availabilityRead: Chart
    availabilityWrite: Chart
    throughputRead: Chart
    throughputWrite: Chart
    latencyRead: Chart
    latencyWrite: Chart
}

export function renderChart(title: string, chart: Chart, palette = defaultPalette): string {
    // 1. Filter zeros
    let minLength = Number.POSITIVE_INFINITY;
    for (const metric of chart) {
        metric.values = metric.values.filter(v => v[1] != '0');
        if (metric.values.length < minLength) minLength = metric.values.length;
    }
    // 2. Limit values (count)
    for (const metric of chart) {
        // Skip first values then adjusting
        metric.values = metric.values.slice(-1 * minLength);
    }

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    let lines = [];
    for (const series of chart) {
        let line = []

        for (let [, value] of series.values) {
            let v = Math.round(parseFloat(value) * 1000) / 1000;
            if (isNaN(v)) {
                v = 0;
            }

            line.push(v);

            if (v < min) min = v;
            if (v > max) max = v;
        }

        lines.push(`line "${series.metric["ref"]}" [${line.join()}]`);
    }

    return `\`\`\`mermaid
---
config:
    xyChart:
        width: 1200
        height: 400
    themeVariables:
        xyChart:
            titleColor: "#222"
            backgroundColor: "#fff"
            xAxisLineColor: "#222"
            yAxisLineColor: "#222"
            plotColorPalette: "${palette.join()}"
---
xychart-beta
    title "${title}"
    x-axis 0 --> 10
    y-axis ${Math.floor(min * 0.9)} --> ${Math.floor(max * 1.1)}
    ${lines.join("\n    ")}
\`\`\`
`
}

const fs = require("fs");
const os = require("os");
console.log("Arguments", process.argv);

let [, , inputPath, desiredParamsPath] = process.argv;

let parsed; // SLO run results
let desiredParams; // desired run results

try {
  parsed = JSON.parse(fs.readFileSync(inputPath));
  desiredParams = JSON.parse(fs.readFileSync(desiredParamsPath));
} catch (error) {
  console.error("Error while reading file", error);
  process.exit(1);
}

let checksResults = desiredParams.map((desiredParam, index) => {
  // find values where every search value is valid AND value of param is not undefined
  const filtered = parsed.filter(
    (value) =>
      Object.entries(desiredParam.find)
        .map(([k, v]) => value[k] == v)
        .every((v) => v) && typeof value[desiredParam.cmp[0]] !== "undefined"
  );
  const paramsForPrint = JSON.stringify(desiredParam.find);
  console.log(
    `Filtered ${filtered.length} metrics for desired param #${index} (${paramsForPrint})`,
    filtered
  );
  const res = filtered.map((value) => {
    const resultParam = value[desiredParam.cmp[0]];
    console.log(
      "Compare",
      resultParam,
      desiredParam.cmp[1],
      desiredParam.cmp[2]
    );
    let compared = false;
    if (desiredParam.cmp[1] === "<")
      compared = resultParam < desiredParam.cmp[2];
    else if (desiredParam.cmp[1] === ">")
      compared = resultParam > desiredParam.cmp[2];
    else if (desiredParam.cmp[1] === "==")
      compared = resultParam == desiredParam.cmp[2];

    // return result of comparison
    return {
      ok: compared,
      name: `${desiredParam.cmp[0]} ${desiredParam.cmp[1]} ${desiredParam.cmp[2]} (${paramsForPrint})`,
      actual: resultParam,
    };
  });
  return res;
});

checksResults = checksResults.flat();

console.log("checkRun", checksResults);

setOutput(
  "checks_matrix",
  JSON.stringify(checksResults.map((_, i) => `check_${i}`))
);

fs.mkdirSync("checks_results");
checksResults.map((result, i) => {
  fs.writeFileSync(
    `checks_results/check_${i}_conclusion`,
    result.ok ? "success" : "failure"
  );
  fs.writeFileSync(
    `checks_results/check_${i}_output`,
    JSON.stringify({
      title: result.name,
      summary: `Must be ${result.name}\nbut actual is: ${result.actual}`,
    })
  );
  fs.writeFileSync(`checks_results/check_${i}_name`, result.name);
});

/////////////////
// Let's imagine that below are libraries :-)
/////////////////
// code taken from here -> https://github.com/actions/toolkit/blob/main/packages/core/src/core.ts#L192:

function setOutput(name, value) {
  console.log(`//// set output //// ${name} = ${value}`);
  const filePath = process.env["GITHUB_OUTPUT"] || "";
  if (filePath) {
    return issueFileCommand("OUTPUT", prepareKeyValueMessage(name, value));
  }

  // process.stdout.write(os.EOL);
  // issueCommand("set-output", { name }, toCommandValue(value));
}

function issueFileCommand(command, message) {
  const filePath = process.env[`GITHUB_${command}`];
  if (!filePath) {
    throw new Error(
      `Unable to find environment variable for file command ${command}`
    );
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file at path: ${filePath}`);
  }

  fs.appendFileSync(filePath, `${toCommandValue(message)}${os.EOL}`, {
    encoding: "utf8",
  });
}

function prepareKeyValueMessage(key, value) {
  const delimiter = `ghadelimiter_75442486-0878-440c-9db1-a7006c25a39f`;
  const convertedValue = toCommandValue(value);
  return `${key}<<${delimiter}${os.EOL}${convertedValue}${os.EOL}${delimiter}`;
}

function toCommandValue(input) {
  if (input === null || input === undefined) {
    return "";
  } else if (typeof input === "string" || input instanceof String) {
    return input;
  }
  return JSON.stringify(input);
}

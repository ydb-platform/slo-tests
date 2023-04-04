const fs = require("fs");
console.log("Arguments", process.argv);

let [, , inputPath, outputPath] = process.argv;

let results;
try {
  const file = JSON.parse(fs.readFileSync(inputPath));
  results = file.results;
} catch (error) {
  console.error("Error while reading file", error);
  process.exit(1);
}

const queries = Object.keys(results);
console.log("queries", queries);

const res = new Map();
queries.map((q) => {
  if (!results[q].frames) {
    console.log(`No results for ${q}`, results[q]);
  } else
    results[q].frames.map((v) => {
      const key = Object.values(v.schema.fields[1].labels).join(";");
      res.set(key, {
        ...res.get(key),
        ...v.schema.fields[1].labels,
        [q]: v.data.values[1][0],
      });
    });
});

const array = Array.from(res.values());
console.log(array);
fs.writeFileSync(outputPath, JSON.stringify(array));

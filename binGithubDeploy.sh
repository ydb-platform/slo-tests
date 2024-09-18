#!/bin/bash

npm run build && ncc build -o dist/main --minify --no-cache --license licenses.txt lib/main.js && ncc build -o dist/post --minify --no-cache --license licenses.txt lib/post.js

git add dist/*

git add src/*

git add k8s/ci/*

git commit -m "add compil files"
#!/bin/bash

echo 'accountId,status,response,curl,responseTime' > result.csv
k6 run --quiet --env CSV_ROWS=10 test.js 2>&1 | grep -E '^[0-9]+,' >> result.csv
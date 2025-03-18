# qa-member-tools
requirement:
- nodeJs

how to run:
- clone the repo
- in terminal, run: node <filename.js>

note:
make sure to check the csv first.
---

1. batchReg.js -> it is to register user to UNM in a batch. This mimic the FE registration and the data are coming from register.csv
2. upgradeTier.js -> to upgrade the tier for user by account id in a batch
3. setPassword.js -> automation team has issue in logging in to preproduction using old member services because if user created from UNM --which will always be the case, member DB does not store password, hence, the issue. To overcome this, I created this script to run the reset password method.
Some notes before running this:
- make sure the csv is correct
- make sure the unmUserId(s) is deleted first and back them up somewhere
- after success running the script, paste back the unmUserId(s) to DB manually

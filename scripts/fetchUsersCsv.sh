#!/bin/bash
# One-off lookup of user records from the sandbox admin users endpoint.

BASE_URL="https://sandbox.eph.bliblitiket.tools/gks-unm-go-dashboard-be/api/v1/admin/users"
OUT="users-lookup.csv"

EMAILS=(
gaurav.juneja@tiket.com
travelmanager@yopmail.com
dashboard.superadmin@yopmail.com
harshit-admin@yopmail.com
akash_preprod_admin@yopmail.com
inspayadmin@yopmail.com
preprod1985_traveler@yopmail.com
harshit.super@yopmail.com
traveler.travelpolicy.preprod.automation@yopmail.com
company1@yopmail.com
multicurrency@yopmail.com
flightpolicytraveler@yopmail.com
flightpolicy@yopmail.com
interimblocked@yopmail.com
interimblockedtraveler@yopmail.com
harshit.ranjan@tiket.com
customfieldsadmin@yopmail.com
customfieldtraveler@yopmail.com
preprodinstant-traveler@yopmail.com
simplecorp@yopmail.com
simpletraveler@yopmail.com
travelplan@yopmail.com
travelplantraveler@yopmail.com
nothingapplied@yopmail.com
nothingappliedtraveler@yopmail.com
hellointernal@yopmail.com
harshit.ranjan@12tiket.com
corpcodetraveler@yopmail.com
)

echo "userId,email,phoneCountryCode,phoneNationalNumber" > "$OUT"

for email in "${EMAILS[@]}"; do
  encoded=$(printf '%s' "$email" | sed 's/@/%40/g; s/+/%2B/g')
  resp=$(curl -s -X GET "${BASE_URL}?identity=${encoded}" -H 'accept: application/json')
  echo "$resp" | node -e '
    let raw = "";
    process.stdin.on("data", (d) => (raw += d));
    process.stdin.on("end", () => {
      const email = process.argv[1];
      let rows = [];
      try {
        const json = JSON.parse(raw);
        rows = Array.isArray(json.data) ? json.data : [];
      } catch (e) {}
      // The identity param does fuzzy matching, so keep only the exact email.
      const match = rows.find((r) => (r.email || "").toLowerCase() === email.toLowerCase());
      if (!match) {
        console.log(`NOT_FOUND,${email},,`);
        return;
      }
      console.log([match.userId ?? "", match.email, match.phoneCountryCode ?? "", match.phoneNationalNumber ?? ""].join(","));
    });
  ' "$email" >> "$OUT"
done

cat "$OUT"

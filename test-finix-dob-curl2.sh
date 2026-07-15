#!/bin/bash
source .env
AUTH=$(echo -n "$FINIX_USERNAME:$FINIX_PASSWORD" | base64)

function do_request() {
  local payload=$1
  local name=$2
  echo -e "\nTesting $name..."
  RESPONSE=$(curl -s -X POST https://api-sandbox.finix.com/identities \
    -H "Authorization: Basic $AUTH" \
    -H "Content-Type: application/json" \
    -H "Finix-Version: 2022-02-01" \
    -d "$payload")
  echo "$RESPONSE"
}

BASE='{"type":"BUSINESS","identity_roles":["SELLER"],"entity":{"business_name":"Test Corp","first_name":"John","last_name":"Doe","personal_address":{"line1":"123 Main St","city":"Anytown","region":"CA","postal_code":"12345","country":"USA"},"title":"CEO","email":"test@example.com","phone":"5555555555","tax_id":"123456789","principal_percentage_ownership":100'

do_request "$BASE,\"dob\":{\"year\":1990,\"month\":5,\"day\":15}}}" "Object with numbers"
do_request "$BASE,\"dob\":{\"year\":\"1990\",\"month\":\"5\",\"day\":\"15\"}}}" "Object with strings (no padding)"
do_request "$BASE,\"dob\":{\"year\":\"1990\",\"month\":\"05\",\"day\":\"15\"}}}" "Object with strings (padded)"
do_request "$BASE,\"dob\":\"1990-05-15\"}}" "String YYYY-MM-DD"

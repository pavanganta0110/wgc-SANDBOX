#!/bin/bash
source .env
AUTH=$(echo -n "$FINIX_USERNAME:$FINIX_PASSWORD" | base64)

echo "Testing string format..."
curl -s -X POST https://api-sandbox.finix.com/identities \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/json" \
  -H "Finix-Version: 2022-02-01" \
  -d '{"type":"BUSINESS","identity_roles":["SELLER"],"entity":{"dob":"1990-05-15"}}' | grep -o '"message":"[^"]*"' || echo "No message"

echo "Testing object format..."
curl -s -X POST https://api-sandbox.finix.com/identities \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/json" \
  -H "Finix-Version: 2022-02-01" \
  -d '{"type":"BUSINESS","identity_roles":["SELLER"],"entity":{"dob":{"year":1990,"month":5,"day":15}}}' | grep -o '"message":"[^"]*"' || echo "No message"

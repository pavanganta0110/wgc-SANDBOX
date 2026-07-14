#!/bin/bash
set -e

update_env() {
  key=$1
  val=$2
  echo "Setting $key..."
  
  # Remove existing variable (ignore error if not found)
  npx vercel env rm "$key" -y || true
  
  # Add for production
  npx vercel env add "$key" production --value "$val" --yes
  
  # Add for preview
  npx vercel env add "$key" preview --value "$val" --yes
}

update_env "FINIX_ENV" "sandbox"
update_env "FINIX_PROCESSOR" "DUMMY_V1"
update_env "FINIX_BASE_URL" "https://finix.sandbox-payments-api.com"
update_env "FINIX_USERNAME" "USbv1Tffxq7nVSuYqAVfEVen"
update_env "FINIX_PASSWORD" "7f6bca79-fda1-4da0-9da3-5366b4b68dd9"
update_env "FINIX_APPLICATION_ID" "APtgqXpMxNt7jdxCxeVn4fJc"
update_env "NEXT_PUBLIC_FINIX_APPLICATION_ID" "APtgqXpMxNt7jdxCxeVn4fJc"
update_env "FINIX_WEBHOOK_SECRET" "sandbox_webhook_secret"
update_env "NEXT_PUBLIC_FINIX_ENV" "sandbox"
update_env "FINIX_WEBHOOK_BASIC_USERNAME" "wgc_finix_webhook"
update_env "FINIX_WEBHOOK_BASIC_PASSWORD" "Pavankumarreddy145@"

echo "Vercel environment variables successfully updated!"

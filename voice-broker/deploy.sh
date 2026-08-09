#!/usr/bin/env bash
# Deploy the Voice Task Broker to AWS
# Usage: ./deploy.sh [stack-name] [region]
# Requires: AWS CLI + SAM CLI installed and configured

set -e

STACK=${1:-asana-voice-broker}
REGION=${2:-us-east-1}

echo ""
echo "  Deploying voice task broker..."
echo "  Stack:  $STACK"
echo "  Region: $REGION"
echo ""

# Build + deploy SAM stack
sam build --template template.yaml
sam deploy \
  --stack-name "$STACK" \
  --region "$REGION" \
  --capabilities CAPABILITY_IAM \
  --resolve-s3 \
  --no-confirm-changeset

# Get outputs
API_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
  --output text)

BUCKET=$(aws cloudformation describe-stacks \
  --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='MobileBucketName'].OutputValue" \
  --output text)

CF_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK" --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='MobileUrl'].OutputValue" \
  --output text)

# Inject the API URL into the mobile page and upload to S3
sed "s|__API_URL__|$API_URL|g" mobile/index.html > /tmp/voice-index.html
aws s3 cp /tmp/voice-index.html "s3://$BUCKET/index.html" \
  --content-type "text/html" --cache-control "no-cache"

echo ""
echo "  ✅  Broker deployed successfully."
echo ""
echo "  API URL:    $API_URL"
echo "  Mobile URL: $CF_URL"
echo ""
echo "  In the dashboard, open the Voice Setup modal and enter:"
echo "    API URL:    $API_URL"
echo "    Mobile URL: $CF_URL"
echo ""
echo "  Your personal voice page will be:"
echo "    $CF_URL?token=YOUR_TOKEN"
echo "  (The dashboard generates your token automatically.)"
echo ""

#!/bin/bash

# Define the target path
TARGET_PATH="./src/environments/environment.ts"

# Create the directory if it doesn't exist
mkdir -p ./src/environments

# Generate the environment file using Render's secret variables
cat <<EOF > $TARGET_PATH
export const environment = {
  production: true,
  supabaseUrl: '${SUPABASE_URL}',
  supabaseKey: '${SUPABASE_KEY}'
};
EOF

echo "✅ environment.ts generated successfully with Render variables."
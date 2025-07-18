#!/bin/bash

echo "🏥 AWS Infrastructure Visualizer Health Check"
echo "============================================="

# Default URL
URL=${1:-"http://localhost:3000"}

echo "🔍 Checking application at: $URL"

# Check if the server is responding
echo ""
echo "📡 Testing server health endpoint..."
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$URL/health" 2>/dev/null)

if [ "$HEALTH_RESPONSE" = "200" ]; then
    echo "✅ Server health check passed (HTTP $HEALTH_RESPONSE)"
else
    echo "❌ Server health check failed (HTTP $HEALTH_RESPONSE)"
    echo "   Make sure the server is running on $URL"
    exit 1
fi

# Check if the main application loads
echo ""
echo "🌐 Testing main application endpoint..."
MAIN_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$URL" 2>/dev/null)

if [ "$MAIN_RESPONSE" = "200" ]; then
    echo "✅ Main application loads successfully (HTTP $MAIN_RESPONSE)"
else
    echo "❌ Main application failed to load (HTTP $MAIN_RESPONSE)"
    exit 1
fi

# Check API regions endpoint
echo ""
echo "🗺️  Testing API regions endpoint..."
REGIONS_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$URL/api/regions" 2>/dev/null)

if [ "$REGIONS_RESPONSE" = "200" ]; then
    echo "✅ API regions endpoint working (HTTP $REGIONS_RESPONSE)"
else
    echo "❌ API regions endpoint failed (HTTP $REGIONS_RESPONSE)"
    exit 1
fi

# Test that the scan endpoint exists (should return 400 for missing credentials)
echo ""
echo "🔍 Testing API scan endpoint (expecting 400 for missing credentials)..."
SCAN_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/api/scan" 2>/dev/null)

if [ "$SCAN_RESPONSE" = "400" ]; then
    echo "✅ API scan endpoint responds correctly (HTTP $SCAN_RESPONSE)"
else
    echo "❌ API scan endpoint unexpected response (HTTP $SCAN_RESPONSE)"
    exit 1
fi

echo ""
echo "🎉 All health checks passed!"
echo ""
echo "✨ Application is ready to use at: $URL"
echo ""
echo "📝 Next steps:"
echo "   1. Open $URL in your browser"
echo "   2. Enter your AWS temporary credentials"
echo "   3. Click 'Scan AWS Infrastructure'"
echo "   4. Explore your infrastructure visualization!" 
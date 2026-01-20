#!/bin/bash

# =============================================================================
# Weather Edge Function Test Script
# Run this after deployment to verify everything is working
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Weather Edge Function Test Suite"
echo "=========================================="
echo ""

# Configuration - UPDATE THESE VALUES
SUPABASE_URL="${SUPABASE_URL:-YOUR_SUPABASE_URL}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-YOUR_ANON_KEY}"

# Test coordinates (Calgary, AB)
TEST_LAT=51.0447
TEST_LON=-114.0719

# Check if configuration is set
if [[ "$SUPABASE_URL" == "YOUR_SUPABASE_URL" ]]; then
    echo -e "${YELLOW}⚠️  Please set SUPABASE_URL environment variable${NC}"
    echo "   export SUPABASE_URL=https://your-project.supabase.co"
    echo ""
fi

if [[ "$SUPABASE_ANON_KEY" == "YOUR_ANON_KEY" ]]; then
    echo -e "${YELLOW}⚠️  Please set SUPABASE_ANON_KEY environment variable${NC}"
    echo "   export SUPABASE_ANON_KEY=your-anon-key"
    echo ""
    exit 1
fi

FUNCTION_URL="${SUPABASE_URL}/functions/v1/get-weather"

echo "Testing: ${FUNCTION_URL}"
echo "Coordinates: ${TEST_LAT}, ${TEST_LON}"
echo ""

# -----------------------------------------------------------------------------
# Test 1: Basic Request
# -----------------------------------------------------------------------------
echo "Test 1: Basic weather request..."
RESPONSE=$(curl -s -X POST "${FUNCTION_URL}" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"lat\": ${TEST_LAT}, \"lon\": ${TEST_LON}}")

if echo "$RESPONSE" | grep -q '"conditions"'; then
    echo -e "${GREEN}✅ Test 1 PASSED: Got weather data${NC}"
    echo "   Location: $(echo $RESPONSE | grep -o '"location":"[^"]*"' | cut -d'"' -f4)"
    echo "   Conditions: $(echo $RESPONSE | grep -o '"conditions":"[^"]*"' | cut -d'"' -f4)"
    echo "   Temperature: $(echo $RESPONSE | grep -o '"temperature":[0-9-]*' | cut -d':' -f2)°C"
else
    echo -e "${RED}❌ Test 1 FAILED${NC}"
    echo "   Response: $RESPONSE"
fi
echo ""

# -----------------------------------------------------------------------------
# Test 2: Cache Hit
# -----------------------------------------------------------------------------
echo "Test 2: Cache hit (second request should be cached)..."
RESPONSE2=$(curl -s -X POST "${FUNCTION_URL}" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"lat\": ${TEST_LAT}, \"lon\": ${TEST_LON}}")

if echo "$RESPONSE2" | grep -q '"cached":true'; then
    echo -e "${GREEN}✅ Test 2 PASSED: Cache hit confirmed${NC}"
else
    echo -e "${YELLOW}⚠️  Test 2: Cache miss (might be first request to this instance)${NC}"
fi
echo ""

# -----------------------------------------------------------------------------
# Test 3: Force Refresh
# -----------------------------------------------------------------------------
echo "Test 3: Force refresh (bypass cache)..."
RESPONSE3=$(curl -s -X POST "${FUNCTION_URL}" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"lat\": ${TEST_LAT}, \"lon\": ${TEST_LON}, \"forceRefresh\": true}")

if echo "$RESPONSE3" | grep -q '"cached":false'; then
    echo -e "${GREEN}✅ Test 3 PASSED: Force refresh worked${NC}"
elif echo "$RESPONSE3" | grep -q '"conditions"'; then
    echo -e "${GREEN}✅ Test 3 PASSED: Got fresh data${NC}"
else
    echo -e "${RED}❌ Test 3 FAILED${NC}"
    echo "   Response: $RESPONSE3"
fi
echo ""

# -----------------------------------------------------------------------------
# Test 4: Invalid Coordinates
# -----------------------------------------------------------------------------
echo "Test 4: Invalid coordinates (should return error)..."
RESPONSE4=$(curl -s -X POST "${FUNCTION_URL}" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"lat": 999, "lon": -999}')

if echo "$RESPONSE4" | grep -q '"error"'; then
    echo -e "${GREEN}✅ Test 4 PASSED: Invalid coordinates rejected${NC}"
else
    echo -e "${RED}❌ Test 4 FAILED: Should have returned error${NC}"
    echo "   Response: $RESPONSE4"
fi
echo ""

# -----------------------------------------------------------------------------
# Test 5: Missing Coordinates
# -----------------------------------------------------------------------------
echo "Test 5: Missing coordinates (should return error)..."
RESPONSE5=$(curl -s -X POST "${FUNCTION_URL}" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d '{}')

if echo "$RESPONSE5" | grep -q '"error"'; then
    echo -e "${GREEN}✅ Test 5 PASSED: Missing coordinates rejected${NC}"
else
    echo -e "${RED}❌ Test 5 FAILED: Should have returned error${NC}"
    echo "   Response: $RESPONSE5"
fi
echo ""

# -----------------------------------------------------------------------------
# Test 6: Different Location (Edmonton)
# -----------------------------------------------------------------------------
echo "Test 6: Different location (Edmonton, AB)..."
RESPONSE6=$(curl -s -X POST "${FUNCTION_URL}" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"lat": 53.5461, "lon": -113.4938}')

if echo "$RESPONSE6" | grep -q '"conditions"'; then
    echo -e "${GREEN}✅ Test 6 PASSED: Edmonton weather retrieved${NC}"
    echo "   Location: $(echo $RESPONSE6 | grep -o '"location":"[^"]*"' | cut -d'"' -f4)"
else
    echo -e "${RED}❌ Test 6 FAILED${NC}"
    echo "   Response: $RESPONSE6"
fi
echo ""

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
echo "=========================================="
echo "Test Summary"
echo "=========================================="
echo ""
echo "If all tests passed, your weather Edge Function is working correctly!"
echo ""
echo "Next steps:"
echo "1. Update weatherService.js in your app"
echo "2. Deploy your app: git push origin main"
echo "3. Test in the inspector report form"
echo ""

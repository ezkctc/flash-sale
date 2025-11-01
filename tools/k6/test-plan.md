# Plan: K6 Flash Sale Stress Test - Simulating 1000–5000 Concurrent Buyers with Automatic Verification

## 1. Test Script Foundation and Configuration

- Create `/tools/k6/flash-sale-stress.js` as the main stress test script
- Define environment variables:
  - `API_BASE` (default: `http://localhost:4000`)
  - `FLASH_SALE_DURATION` (default: 600 seconds)
  - `STARTING_QUANTITY` (default: 100)
  - `POLLING_INTERVAL` (default: 2 seconds, configurable)
- Configure K6 test stages:
  - Ramp to 1000 VUs over 30 seconds
  - Sustain 1000 for 1 minute
  - Ramp to 3000 over 1 minute
  - Ramp to 5000 over 1 minute
  - Sustain 5000 for 2 minutes
  - Ramp down to 0 over 1 minute
- Set thresholds:
  - HTTP request failure rate < 1%
  - P95 response time < 2s
  - P99 response time < 5s
- Define custom metrics:
  - Buy success rate
  - Position check frequency
  - Hold acquisition time
  - Confirmation success rate
  - Total confirmed orders

## 2. Setup Phase – Test Data Preparation

- Implement a `setup()` function that runs once before the test
- Generate a unique admin email using a timestamp  
  Example: `admin-{timestamp}@test.com`
- Call `POST /api/auth/sign-up/email` to create the admin user
- Extract and store the authentication token
- Calculate flash sale timing:
  - `startsAt`: 5 seconds from now
  - `endsAt`: `startsAt` + `FLASH_SALE_DURATION`
- Call `POST /flash-sales` with the admin token to create the sale
- Store flash sale ID in a shared array for all virtual users
- Add a 3-second delay before user simulation begins

## 3. Main Test Flow – Virtual User Simulation

- Generate unique buyer emails per VU: `buyer-{VU}-{ITER}@test.com`
- Retrieve flash sale ID from shared state
- Implement buy–check–confirm loop with retries
- Add think time between polls for realism
- Track timing for each phase:
  - Buy attempt
  - Position polling
  - Hold acquisition
  - Confirmation
- Implement exponential backoff for polling:
  - Start = `POLLING_INTERVAL`
  - Multiply ×1.5 up to max 10s
- Tag requests (`buy`, `position`, `confirm`) for metrics

## 4. Buy–Check–Confirm Loop Logic

1. `POST /orders/buy`  
   Handle:
   - `409` already purchased
   - `503` queue unavailable
   - `200` queued successfully
2. If `hasActiveHold`, skip to confirmation
3. If response has a position, poll:
   - `GET /orders/position`
   - Repeat until status = `ready` or timeout
4. If position = `ready`, call:
   - `POST /orders/confirm`
5. Handle confirmation:
   - `200` success
   - `403` hold expired
   - `409` out of stock or already confirming
6. Retry buy max 5 times

## 5. Guard Rails and Edge Case Handling

- Before each buy:
  - `GET /flash-sales/public/sale?flashSaleId={id}`
- If:
  - `soldOut = true` or `currentQuantity = 0` → stop
  - `status = ended` → stop all attempts
- Track outcomes:
  - Success
  - Failed
  - Gave up
- Timeout after 5 minutes of polling
- Handle HTTP errors (`500–504`) with exponential backoff
- Record failure reason:
  - Sold out
  - Timeout
  - Expired hold
  - API error

## 6. Verification Phase – Overbooking Detection

- Implement `teardown()` after all users complete
- Wait 10 seconds for pending writes
- Iterate through all buyer emails
- `GET /orders/by-email?email={email}` to verify orders
- Count total confirmed (where `paymentStatus = paid`)
- Fetch final sale data:
  - `GET /flash-sales/public/sale?flashSaleId={id}`
- Validate:
  - `totalOrders + finalQuantity = STARTING_QUANTITY`
- If exceeded → **OVERBOOKING DETECTED**
- If under → **UNDERSELLING DETECTED**
- Output summary:
  - Total orders
  - Final quantity
  - Starting quantity
  - Pass/fail status

## 7. Metrics, Reporting, and Output

- **Counters**
  - Total buy attempts
  - Successful/failed buys
  - Total position checks
  - Total/failed confirmations
- **Trends**
  - Buy → Hold time
  - Hold → Confirm time
  - Total journey time
- **Rates**
  - Buy success
  - Confirm success
  - Polling frequency
- Console output every 10 seconds
- Final summary table:
  - Total VUs
  - Attempts
  - Successful purchases
  - Failures by reason
  - Avg/P95/P99 journey times
- Threshold checks:
  - HTTP error rate
  - Response times
  - Overbooking status
- Export JSON results:  
  `--out json=results.json`

## 8. Helper Functions and Utilities

- `sleepHelper()` respecting polling interval
- `randomEmail()` generator
- `checkSaleStatus()` returning soldOut/currentQuantity
- `waitForHold()` with exponential backoff
- `logVUProgress()` for selective debug logs (VU 1 only)
- `formatDuration()` to format milliseconds

## 9. Documentation and Usage Instructions

- Add inline comments in the script
- Include usage examples and environment configuration
- Document environment variables and defaults
- Example run commands for different configs
- Explain result interpretation and pass criteria

---

### **Summary**

This K6 stress test simulates 1,000–5,000 concurrent users competing for limited inventory.  
It validates the entire purchase lifecycle—queueing, hold management, confirmation—and ensures no overbooking.  
Configurable intervals allow realistic user pacing, while metrics expose bottlenecks in each phase.  
Exponential backoff and guard rails prevent overload but maintain realistic concurrency.  
Final verification ensures total confirmed orders never exceed available stock, providing a clear pass/fail result and actionable insights for optimizing flash sale performance under high load.

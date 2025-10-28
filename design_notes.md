## Problem Description

This system is most likely a stand alone feature that is being tested. Maybe it will be implemented to a greater system; maybe not.

## Core Functional Requirements

1. **Flash Sale Period**

   - save start and end time in utc
   - check timings client and serverside

2. **Single Product, Limited Stock**

   - someway to create the flashsale
   - dont have to define product now, just need to define quantity
   - do optimistic locking in quantity to prevent oversell,
   - usign mongodb can't do traditional database-level row locking
   - failure to pay may move on to another user or allow to pay again within a certain time limit

3. **One Item Per User**

   - User was not specified as a logged in user most likely a guest user
   - Idempotency must be enforced. each request to order must have unique identity and need to check if there are duplicates in cache
   - problably need to somehow lock in cache first and do eventual consistency in DB

4. **API Server**  
   You need to implement a server that exposes the necessary API endpoints to support the flash sale functionality.  
   This should include, but is not limited to:

   - An endpoint to check the status of the flash sale (e.g., upcoming, active, ended).
     -- just derive the status from the start and end date no need for a cron job to change the status

   - An endpoint for a user to attempt a purchase.
     -- attempt to buy and pay

   - An endpoint for a user to check if they have successfully secured an item.
     -- derived from a unique identitfier such as an email

5. **Simple Frontend**  
   Develop a basic frontend interface to demonstrate the functionality of your system.  
   The frontend should allow a user to:

   - See the current status of the sale.
     -- add countdown
   - Enter a user identifier (e.g., a username or email).
     -- no specification if use is logged in or not, assume guest user
     -- user email. cant do confirmation email now implement later
   - Click a “Buy Now” button to attempt a purchase.
     -- only allow to click if its within the scheduled tims
   - Receive feedback on whether their purchase was successful, if they already purchased, or if the sale has ended/sold out.
     -- ideally done through email, but for simplicity just inform thorugh a popup

6. **System Diagram**
   - erd
   - sequence
   - dataflow
   - user flow
   - architectural diagram

## Non-Functional Requirements

1. **High Throughput & Scalability**

- cant fully code with live cloud just explain properly
- no exact iops stated just assume thousands

2. **Robustness & Fault Tolerance**

- probably create a controller

3. **Concurrency Control**

- fastify can already hadnle a lot (more of a hardware issue)
- do atomic transactions for mongodb
- implement REDIS FIFO for fairness
- create service worker to consume the queue

## Testing Requirements

- **Unit & Integration Tests**

  - use vite or jest
  - vite a little faster

- **Stress Tests**
  - probably just use k6

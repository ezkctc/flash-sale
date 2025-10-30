# Flash Sale System

A high-throughput, scalable flash sale platform designed to handle thousands of concurrent purchase attempts with fairness, inventory accuracy, and system resilience.

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Data Flow](#data-flow)
- [Core Components](#core-components)
- [Concurrency & Fairness](#concurrency--fairness)
- [Getting Started](#getting-started)
- [API Documentation](#api-documentation)
- [Testing Strategy](#testing-strategy)
- [Design Decisions](#design-decisions)

## Overview

This system implements a flash sale platform for limited-stock products with the following characteristics:

- **High Throughput**: Handles thousands of concurrent purchase attempts
- **FIFO Fairness**: Queue-based system ensures first-come, first-served ordering
- **Inventory Accuracy**: Atomic operations prevent overselling
- **One Item Per User**: Enforced through idempotency and hold mechanisms
- **Time-Bounded Sales**: Configurable start/end times for flash sales
- **Graceful Degradation**: Worker-based processing prevents API overload

## System Architecture

### High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        A[Admin Web<br/>Next.js - Port 4200]
        B[Customer Site<br/>Next.js - Port 4201]
    end

    subgraph "API Layer"
        C[Fastify API Server<br/>Port 4000]
    end

    subgraph "Processing Layer"
        D[BullMQ Worker<br/>FIFO Processing]
    end

    subgraph "Data Layer"
        E[(MongoDB<br/>Port 27017)]
        F[(Redis<br/>Port 6379)]
    end

    A -->|Manage Sales| C
    B -->|Purchase Attempts| C
    C -->|Enqueue Jobs| F
    D -->|Consume Jobs| F
    C -->|Read/Write| E
    D -->|Read/Write| E
    D -->|Grant Holds| F
    C -->|Check Holds| F

    style A fill:#e1f5ff
    style B fill:#e1f5ff
    style C fill:#fff4e1
    style D fill:#ffe1f5
    style E fill:#e1ffe1
    style F fill:#ffe1e1
```

### Monorepo Structure

```
flash-sale/
├── apps/
│   ├── api/              # Fastify backend API
│   ├── worker/           # BullMQ consumer worker
│   ├── admin-web/        # Admin dashboard (Next.js)
│   └── site-web/         # Customer-facing site (Next.js)
├── libs/
│   ├── shared-types/     # Shared TypeScript types & schemas
│   ├── shared-config/    # Shared configuration
│   └── shared-utils/     # Shared utility functions
└── docker-compose.yml    # Infrastructure setup
```

## Key Features

### 1. Queue-Based Fairness (FIFO)

```mermaid
sequenceDiagram
    participant U as User
    participant A as API
    participant R as Redis ZSET
    participant Q as BullMQ Queue
    participant W as Worker

    U->>A: POST /orders/buy
    A->>R: ZADD fsq:{saleId} {timestamp} {email}
    A->>Q: Enqueue job with email
    A->>U: Return position in queue

    Note over W: Process FIFO
    Q->>W: Dequeue next job
    W->>W: Validate sale window
    W->>R: SET fsh:{saleId}:{email} EX 900
    W->>Q: Job complete

    Note over U: User has 15 min hold
```

### 2. Atomic Inventory Management

```mermaid
sequenceDiagram
    participant U as User
    participant A as API
    participant R as Redis
    participant M as MongoDB

    U->>A: POST /orders/confirm
    A->>R: Check TTL of hold key

    alt Hold exists (TTL > 0)
        A->>M: findOneAndUpdate<br/>{currentQuantity: {$gt: 0}}<br/>{$inc: {currentQuantity: -1}}

        alt Inventory available
            M-->>A: Updated document
            A->>M: Create/update order (paymentStatus: paid)
            A->>R: Delete hold key & queue position
            A->>U: Success with order ID
        else Sold out
            M-->>A: null (no match)
            A->>U: 409 Sold out
        end
    else Hold expired
        A->>U: 410 Reservation expired
    end
```

### 3. Purchase Flow

```mermaid
graph LR
    A[User Clicks Buy] --> B{Sale Active?}
    B -->|No| C[Show Error]
    B -->|Yes| D[Enqueue to BullMQ]
    D --> E[Show Queue Position]
    E --> F{Worker Processes}
    F --> G[Grant Hold - 15min TTL]
    G --> H[User Confirms Payment]
    H --> I{Hold Valid?}
    I -->|No| J[Reservation Expired]
    I -->|Yes| K{Inventory > 0?}
    K -->|No| L[Sold Out]
    K -->|Yes| M[Atomic Decrement]
    M --> N[Create Order]
    N --> O[Clear Hold]
    O --> P[Success]

    style A fill:#e1f5ff
    style P fill:#e1ffe1
    style C fill:#ffe1e1
    style J fill:#ffe1e1
    style L fill:#ffe1e1
```

## Technology Stack

### Backend
- **Fastify 5.x**: High-performance web framework
- **BullMQ**: Redis-backed job queue for FIFO processing
- **MongoDB 7**: Primary data store with atomic operations
- **Redis 7**: Queue management, hold tracking, and caching
- **Mongoose**: MongoDB ODM with schema validation

### Frontend
- **Next.js 15**: React framework for SSR/SSG
- **React 19**: UI library
- **TypeScript**: Type-safe development

### Infrastructure
- **Docker Compose**: Local development environment
- **Nx**: Monorepo build system and task orchestration

### Authentication
- **JWT**: Token-based authentication
- **Fastify JWT**: JWT plugin for route protection

## Data Flow

### Data Model

```mermaid
erDiagram
    FLASH_SALE ||--o{ ORDER : contains

    FLASH_SALE {
        ObjectId _id PK
        string name
        string description
        number initialQuantity
        number currentQuantity
        number pricePerUnit
        Date startsAt
        Date endsAt
        Date createdAt
        Date updatedAt
    }

    ORDER {
        ObjectId _id PK
        string userEmail
        ObjectId flashSaleId FK
        string paymentStatus
        number totalAmount
        Date createdAt
        Date updatedAt
    }

    USER {
        ObjectId _id PK
        string email
        string password
        boolean isAdmin
        Date createdAt
    }
```

### Redis Data Structures

```mermaid
graph TB
    subgraph "Redis Keys"
        A[fsq:saleId<br/>ZSET - Queue Positions]
        B[fsh:saleId:email<br/>STRING - Hold Grants<br/>TTL: 900s]
        C[fsmeta:saleId<br/>STRING - Sale Metadata<br/>TTL: 600s]
    end

    A -->|ZADD timestamp email| D[Track FIFO Order]
    A -->|ZRANK email| E[Get Position]
    A -->|ZREM email| F[Remove on Complete]

    B -->|SET email data EX 900| G[Grant 15min Hold]
    B -->|TTL check| H[Validate Reservation]
    B -->|DEL| I[Clear on Confirm]

    C -->|Cache sale window| J[Reduce DB Queries]

    style A fill:#ffe1e1
    style B fill:#ffe1e1
    style C fill:#ffe1e1
```

## Core Components

### 1. API Server (`apps/api`)

**Responsibilities:**
- Handle HTTP requests from clients
- Enqueue purchase attempts to BullMQ
- Validate and confirm payments
- Serve flash sale information
- Admin operations (CRUD on sales)

**Key Routes:**
- `POST /auth/signup` - Create admin account
- `POST /auth/signin` - Authenticate admin
- `POST /auth/signout` - End session
- `GET /flash-sales` - List all sales (admin)
- `GET /flash-sales/:saleId/public` - Public sale info
- `POST /flash-sales` - Create new sale (admin)
- `PUT /flash-sales/:id` - Update sale (admin)
- `DELETE /flash-sales/:id` - Delete sale (admin)
- `POST /orders/buy` - Enqueue purchase attempt
- `GET /orders/position` - Get queue position
- `POST /orders/confirm` - Confirm payment
- `GET /orders/by-email` - Check order status

### 2. Worker Service (`apps/worker`)

**Responsibilities:**
- Consume jobs from BullMQ queue (FIFO)
- Validate sale time windows
- Grant time-limited holds in Redis
- Rate limiting (50 holds/second)

**Processing Logic:**
```typescript
1. Fetch sale metadata (cached 10 min)
2. Check if current time within [startsAt, endsAt]
3. Check if user already has hold (idempotent)
4. Grant hold with 15-minute TTL in Redis
5. Return success/failure to queue
```

**Configuration:**
- Concurrency: 1 (strict FIFO)
- Rate Limit: 50 jobs/second
- Hold TTL: 900 seconds (15 minutes)

### 3. Admin Dashboard (`apps/admin-web`)

**Features:**
- JWT-based authentication
- Create/edit/delete flash sales
- View all orders
- Monitor queue status in real-time
- View queue members

### 4. Customer Site (`apps/site-web`)

**Features:**
- View active/upcoming flash sales
- Countdown timer to sale start
- Purchase button (only active during sale)
- Queue position tracking
- Order confirmation
- Check order status by email

## Concurrency & Fairness

### Problem: Thundering Herd

Thousands of users clicking "Buy" simultaneously creates:
- Database overload
- Race conditions
- Unfair advantage to faster connections

### Solution: Queue + Worker Pattern

```mermaid
graph TB
    subgraph "Without Queue"
        A1[1000 Concurrent Users] --> B1[(Database)]
        B1 --> C1[Race Conditions]
        B1 --> D1[Overload]
    end

    subgraph "With Queue System"
        A2[1000 Concurrent Users] --> B2[Fast API Response]
        B2 --> C2[Redis Queue<br/>FIFO Order]
        C2 --> D2[Single Worker<br/>Concurrency: 1]
        D2 --> E2[(Database<br/>Sequential Access)]
        E2 --> F2[Fair Processing]
    end

    style C1 fill:#ffe1e1
    style D1 fill:#ffe1e1
    style F2 fill:#e1ffe1
```

### Fairness Mechanisms

1. **FIFO Queue**: BullMQ processes jobs in order of enqueue time
2. **Timestamp Tracking**: Redis ZSET records exact enqueue timestamp
3. **Single Worker**: Concurrency of 1 ensures sequential processing
4. **Hold System**: 15-minute reservation prevents double-booking

### Preventing Overselling

```typescript
// Atomic MongoDB operation prevents race conditions
await flashSaleMongoModel.findOneAndUpdate(
  {
    _id: flashSaleId,
    currentQuantity: { $gt: 0 },      // Only if inventory > 0
    startsAt: { $lte: now },          // Sale must have started
    endsAt: { $gte: now },            // Sale must not have ended
  },
  {
    $inc: { currentQuantity: -1 }     // Atomic decrement
  },
  { new: true }
);
```

**Why This Works:**
- MongoDB's `findOneAndUpdate` is atomic
- Query conditions prevent matching if inventory is 0
- Returns `null` if no document matches
- Only one transaction succeeds per inventory unit

## Getting Started

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- npm or yarn

### Installation

```bash
npm install
```

### Infrastructure Setup

Start MongoDB and Redis:

```bash
npm run infra:up
```

Verify services are running:

```bash
npm run infra:logs
```

### Seed Data

Create an admin user:

```bash
npm run seed:admin
```

Default admin credentials:
- Email: `admin@example.com`
- Password: `admin123`

### Development

Run all services concurrently:

```bash
npm run dev
```

This starts:
- **API**: http://localhost:4000
- **Worker**: Background process
- **Admin Web**: http://localhost:4200
- **Site Web**: http://localhost:4201

Run services individually:

```bash
npm run dev:api      # API only
npm run dev:worker   # Worker only
npm run dev:admin    # Admin dashboard only
npm run dev:site     # Customer site only
```

### Environment Variables

Copy `.env.sample` to `.env` and configure:

```bash
# API Server
BEND_HOST=localhost
BEND_PORT=4000

# Frontend Apps
ADMIN_HOST=localhost
ADMIN_PORT=4200
FEND_HOST=localhost
FEND_PORT=4201

# Database
MONGO_URL=mongodb://root:example@localhost:27017/flash_sale_db?authSource=admin

# Redis
REDIS_URL=redis://:redispass@localhost:6379

# Queue
QUEUE_NAME=sale-processing-queue
HOLD_TTL_SECONDS=900

# JWT
JWT_SECRET=your-secret-key-here
```

## API Documentation

### Interactive API Docs

Once the API is running, visit:

**Swagger UI**: http://localhost:4000/docs

### Key Endpoints

#### Public Endpoints

```bash
# Get sale information
GET /flash-sales/:saleId/public

# Attempt purchase (enqueue)
POST /orders/buy
Body: { "email": "user@example.com", "flashSaleId": "..." }

# Check queue position
GET /orders/position?flashSaleId=...&email=user@example.com

# Confirm payment
POST /orders/confirm
Body: { "email": "user@example.com", "flashSaleId": "...", "totalAmount": 99.99 }

# Check order status
GET /orders/by-email?email=user@example.com&flashSaleId=...
```

#### Admin Endpoints (Requires Authentication)

```bash
# Sign in
POST /auth/signin
Body: { "email": "admin@example.com", "password": "admin123" }

# Create flash sale
POST /flash-sales
Body: {
  "name": "Limited Edition Product",
  "description": "Only 100 available!",
  "initialQuantity": 100,
  "pricePerUnit": 99.99,
  "startsAt": "2025-11-01T10:00:00Z",
  "endsAt": "2025-11-01T12:00:00Z"
}

# List all sales
GET /flash-sales

# Update sale
PUT /flash-sales/:id

# Delete sale
DELETE /flash-sales/:id

# View all orders
GET /orders/admin/list?flashSaleId=...

# Monitor queue
GET /orders/admin/queue/:flashSaleId/overview
GET /orders/admin/queue/:flashSaleId/members
```

## Testing Strategy

### Unit Tests

Test individual functions and components:

```bash
nx test api
nx test worker
nx test shared-types
```

### Integration Tests

Test API endpoints with real database:

```bash
nx test api --testPathPattern=integration
```

### Stress Testing

Use k6 to simulate thousands of concurrent users:

```javascript
// stress-test.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 100 },   // Ramp up to 100 users
    { duration: '1m', target: 1000 },   // Ramp up to 1000 users
    { duration: '30s', target: 0 },     // Ramp down
  ],
};

export default function () {
  const email = `user${__VU}@test.com`;
  const res = http.post('http://localhost:4000/orders/buy',
    JSON.stringify({
      email,
      flashSaleId: 'YOUR_SALE_ID'
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  check(res, {
    'status is 200': (r) => r.status === 200,
    'queued successfully': (r) => JSON.parse(r.body).queued === true,
  });
}
```

Run stress test:

```bash
k6 run stress-test.js
```

**Expected Results:**
- All requests return 200 OK
- Each user gets a queue position
- No overselling occurs
- Worker processes jobs in FIFO order
- System remains responsive under load

## Design Decisions

### 1. Why BullMQ over Direct Database Access?

**Problem:** Direct database access under high concurrency leads to:
- Database connection exhaustion
- Lock contention
- Unpredictable race conditions

**Solution:** Queue-based processing provides:
- O(1) enqueue operations (fast user feedback)
- Controlled database access rate
- FIFO fairness guarantees
- Built-in retry and failure handling

### 2. Why MongoDB with Atomic Operations?

**Alternatives Considered:**
- PostgreSQL with row-level locking
- Redis as primary database

**MongoDB Selected Because:**
- Native support for atomic `findOneAndUpdate`
- Flexible schema for rapid iteration
- Horizontal scaling capabilities
- Lower latency for document operations

**Atomic Operations Prevent:**
```javascript
// Without atomic operations (RACE CONDITION):
const sale = await Sale.findById(id);
if (sale.quantity > 0) {
  sale.quantity -= 1;  // ⚠️ Race condition here!
  await sale.save();
}

// With atomic operations (SAFE):
await Sale.findOneAndUpdate(
  { _id: id, quantity: { $gt: 0 } },
  { $inc: { quantity: -1 } }
);
```

### 3. Why Separate Worker Process?

**Alternative:** Handle everything in API process

**Separation Benefits:**
- Independent scaling (scale workers separately from API)
- Fault isolation (worker crash doesn't affect API)
- Rate limiting without blocking API
- Better resource utilization

### 4. Why Hold System with TTL?

**Problem:** How to handle payment processing time?

**Solution:** Time-limited holds (15 minutes)
- Prevents indefinite inventory locks
- Gives users time to complete payment
- Automatically releases on timeout
- Idempotent (duplicate requests handled gracefully)

### 5. Trade-offs & Limitations

| Decision | Trade-off | Mitigation |
|----------|-----------|------------|
| Single worker concurrency | Slower processing | Horizontal scaling of workers |
| MongoDB (no ACID across collections) | Complex transaction logic | Atomic operations + idempotency |
| Redis for holds | Memory-bound | TTL-based expiration, monitoring |
| No payment gateway integration | Simplified demo | Mock payment in frontend |
| Email-based identity | No authentication required | Easy to add auth layer later |

### 6. Production Considerations

**Not Implemented (Future Work):**
- Distributed worker cluster
- Database sharding
- CDN for static assets
- Real payment gateway (Stripe, PayPal)
- Email notifications
- Observability (metrics, logs, traces)
- Rate limiting per IP
- DDoS protection
- Backup and disaster recovery

**Scalability Path:**
```
Current: 50 holds/second × 1 worker = 50 tps

Scale to 1000 tps:
- Deploy 20 worker instances (each processing 50/sec)
- Add Redis Cluster for queue distribution
- MongoDB replica set for read scaling
- Load balancer for API instances
```

## Monitoring & Debugging

### Queue Status

Check queue overview:
```bash
GET /orders/admin/queue/:saleId/overview
```

Response:
```json
{
  "totalInQueue": 234,
  "processing": 1,
  "waiting": 233
}
```

### Redis CLI

Connect to Redis:
```bash
docker exec -it flash-sale-redis redis-cli -a redispass
```

Useful commands:
```redis
# Check queue size
ZCARD fsq:<saleId>

# Check user position
ZRANK fsq:<saleId> user@example.com

# Check hold TTL
TTL fsh:<saleId>:user@example.com

# View all holds
KEYS fsh:*
```

### MongoDB Queries

Connect to MongoDB:
```bash
docker exec -it flash-sale-mongo mongosh -u root -p example
```

Useful queries:
```javascript
use flash_sale_db

// Check sale inventory
db.flashsales.findOne({ _id: ObjectId("...") })

// Count orders
db.orders.countDocuments({ flashSaleId: ObjectId("...") })

// List paid orders
db.orders.find({ paymentStatus: "paid" })
```

## Contributing

This is a take-home project for demonstration purposes.

## License

MIT

---

**Questions or Issues?**

For questions about architecture decisions or implementation details, please refer to the inline code comments or create an issue in the repository.

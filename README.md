# Flash Sale System: Technical Documentation

## 1. Overview

This system implements a high-throughput, scalable flash sale platform designed to handle thousands of concurrent purchase attempts with fairness, inventory accuracy, and system resilience.

The core challenge addressed by this architecture is the **Flash Crowd problem**, where a massive, simultaneous influx of user traffic (the _Thundering Herd_) occurs the moment a sale begins. Without careful design, this volume of traffic can overwhelm the API and database, leading to server failure, race conditions, and overselling.

### Key Characteristics

- **High Throughput:** Handles thousands of concurrent purchase attempts.
- **FIFO Fairness:** A queue-based system ensures first-come, first-served ordering.
- **Inventory Accuracy:** Uses atomic operations and a dual-layer inventory to prevent overselling.
- **One Item Per User:** Enforced through idempotency and hold mechanisms.
- **Time-Bounded Sales:** Configurable start/end times for flash sales.
- **Graceful Degradation:** Worker-based processing prevents direct API overload.

---

# Table of Contents

1. [Overview](#1-overview)

   - [Key Characteristics](#key-characteristics)

2. [System Architecture](#2-system-architecture)

   - [High-Level Architecture](#high-level-architecture)
   - [Monorepo Structure](#monorepo-structure)

3. [Detailed System Mechanics](#3-detailed-system-mechanics)

   - [FIFO (First-In-First-Out) Queue System](#31-fifo-first-in-first-out-queue-system)
   - [Hold and Reservation System (Two-Phase)](#32-hold-and-reservation-system-two-phase)
   - [MongoDB Atomic Operations (Prevents Overselling)](#33-mongodb-atomic-operations-prevents-overselling)
   - [Dual-Layer Inventory (Redis + MongoDB)](#34-dual-layer-inventory-redis--mongodb)
   - [Fast Pass Mechanism](#35-fast-pass-mechanism)

4. [Design Decisions & Rationale](#4-design-decisions--rationale)

   - [Rationale for Core Decisions](#41-rationale-for-core-decisions)
   - [Trade-offs & Limitations](#42-trade-offs--limitations)
   - [Production Considerations](#43-production-considerations)
   - [Scalability](#44-scalability)
   - [Future Features](#45-future-features)

5. [Technology Stack](#5-technology-stack)

   - [Current Tech Stack](#51-current-tech-stack)
   - [Cloud & Managed Alternatives](#52-cloud--managed-alternatives)

6. [Data Flow and Models](#6-data-flow-and-models)

   - [Data Model (MongoDB)](#61-data-model-mongodb)
   - [Redis Data Structures](#62-redis-data-structures)
   - [Purchase Flow (Diagram)](#63-purchase-flow-diagram)

7. [Core Components](#7-core-components)

   - [API Server (apps/api)](#71-api-server-appsapi)
   - [Worker Service (apps/worker)](#72-worker-service-appsworker)
   - [Admin Dashboard (apps/admin-web)](#73-admin-dashboard-appsadmin-web)
   - [Customer Site (apps/site-web)](#74-customer-site-appssite-web)

8. [Concurrency & Fairness](#8-concurrency--fairness)

9. [Getting Started](#9-getting-started)

   - [Prerequisites](#91-prerequisites)
   - [Installation](#92-installation)
   - [Running Infrastructure](#93-running-infrastructure)
   - [Services and Local URLs](#94-services-and-local-urls)
   - [Creating and Testing the First Admin User](#95-creating-and-testing-the-first-admin-user)
   - [Complete Environment Variables Reference](#96-complete-environment-variables-reference)

10. [Testing Strategy](#10-testing-strategy)

    - [Unit & Integration Tests](#101-unit--integration-tests)
    - [Stress Testing (k6)](#102-stress-testing-k6)

11. [API Documentation](#11-api-documentation)
    - [Public Endpoints](#111-public-endpoints)
    - [Admin Endpoints](#112-admin-endpoints)

---

## 2. System Architecture

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

---

# 3. Detailed System Mechanics

This section provides a detailed breakdown of how the **queue**, **hold**, and **validation mechanisms** interact within the Flash Sale System.

---

## 3.1 FIFO (First-In-First-Out) Queue System

The system uses **Redis Sorted Sets (ZSET)** combined with **BullMQ** to ensure fair, first-come-first-served processing.

### How It Works

1. When a user clicks **"Buy"**, the `POST /orders/buy` endpoint adds their email to a Redis ZSET (`fsq:{saleId}`) with a timestamp as the score.
2. BullMQ creates a job named `reserve` that is processed by the worker.
3. The worker (concurrency = 10) uses distributed locks to ensure atomic operations.
4. The user is shown their queue position, calculated as `ZRANK(email) + 1`.

### Key Files

- `/apps/api/src/app/routes/orders/buy.ts`: Enqueues purchase attempts.
- `/apps/worker/src/main.ts`: Processes jobs in FIFO order.

### Core Redis Commands

| Command                               | Description            |
| ------------------------------------- | ---------------------- |
| `ZADD fsq:saleId {timestamp} {email}` | Adds user to the queue |
| `ZRANK fsq:saleId {email}`            | Gets user’s position   |

---

## 3.2 Hold and Reservation System (Two-Phase)

The system uses a **two-phase reservation mechanism** with time-limited holds to manage inventory from queue to confirmation.

### Phase 1: Worker Grants Hold (15 Minutes)

1. **Checks Sale Window:** Ensures sale is active (`startsAt <= now < endsAt`).
2. **Acquires Lock:** Uses a distributed Redis lock (`fslock:{saleId}`) to prevent race conditions.
3. **Checks Redis Inventory:** Validates availability using a shadow inventory counter (`fsinv:{saleId}`).
4. **Grants Hold:** Sets a hold key (`fsh:{saleId}:{email}`) with a TTL of 900 seconds (15 minutes).
5. **Decrements Inventory:** Atomically decrements the `fsinv:{saleId}` counter.
6. **Schedules Auto-Release:** Enqueues a delayed `release_hold` job (15 minutes).
7. **Removes from Queue:** Executes `ZREM fsq:{saleId} {email}` to remove user from queue.

### Phase 2: User Confirms Payment

1. **Validates Hold:** Checks if the hold key (`fsh:{saleId}:{email}`) exists.
2. **Idempotent Gate:** Creates a `claim` key (`fshc:{saleId}:{email}`) to prevent double-submit.
3. **Atomic MongoDB Decrement:** Performs a final source-of-truth inventory decrement.
4. **Marks Hold as Consumed:** Sets `fshp:{saleId}:{email}` to prevent re-release.
5. **Cleans Up:** Deletes hold, queue, and claim keys.

### Auto-Release Mechanism

If the user doesn’t confirm within 15 minutes:

1. `release_hold` job executes.
2. If the hold isn’t marked as consumed, inventory is restored using `INCR fsinv:{saleId}`.
3. The next user (`ZPOPMIN`) is automatically granted a hold.

---

## 3.3 MongoDB Atomic Operations (Prevents Overselling)

The **source of truth** for inventory resides in MongoDB, which ensures atomicity during decrements.

```ts
// Atomic MongoDB operation prevents race conditions
const updated = await flashSaleMongoModel.findOneAndUpdate(
  {
    _id: flashSaleIdValue,
    startsAt: { $lte: now },
    endsAt: { $gt: now },
    currentQuantity: { $gt: 0 },
  },
  { $inc: { currentQuantity: -1 } },
  { returnDocument: 'after' }
);

if (!updated) {
  return reply.code(409).send({ message: 'Out of stock or sale not active' });
}
```

### Why This Works

- The `findOneAndUpdate` operation is atomic at the document level.
- The condition `currentQuantity: { $gt: 0 }` acts as a safeguard against overselling.
- Only one transaction can successfully decrement each available unit.

---

## 3.4 Dual-Layer Inventory (Redis + MongoDB)

| Layer       | Key               | Description                                | Consistency           |
| ----------- | ----------------- | ------------------------------------------ | --------------------- |
| **Redis**   | `fsinv:{saleId}`  | Shadow inventory for high-speed processing | Eventually consistent |
| **MongoDB** | `currentQuantity` | Source of truth; final stock control       | Strongly consistent   |

---

## 3.5 Fast Pass Mechanism

The **Fast Pass** is an optimization that activates when stock is low. It shifts from multi-threaded to **strict FIFO** to ensure fairness and prevent race conditions.

### Code Snippet

```ts
const threshold = Math.max(1, Math.ceil(initInv * (FAST_PASS_PERCENT / 100)));

if (curStock <= threshold) {
  const head = await redis.zrange(qKey, 0, 0);
  const headEmail = head?.[0] ?? null;
  if (headEmail !== email) throw RETRY_NOT_FIRST;
}
```

### Configuration

`FAST_PASS_PERCENT=1` _(default, configurable via environment variable)_

### Modes of Operation

| Mode          | Condition                   | Behavior                                   | Example                           |
| ------------- | --------------------------- | ------------------------------------------ | --------------------------------- |
| **Normal**    | `currentStock > threshold`  | Up to 10 workers process jobs concurrently | 10 users granted holds per second |
| **Fast Pass** | `currentStock <= threshold` | Only the first queue member proceeds       | Strict FIFO fairness              |

### Benefits

- **Fairness Under Pressure:** Ensures earliest users get the last units.
- **Prevents Race Conditions:** Single-threaded when stock is low.
- **Optimized Performance:** High throughput for abundant stock, strict fairness near depletion.
- **Predictable Behavior:** Guarantees queue order integrity.

### Example Scenario

```text
Initial Stock: 1000 units
Threshold: 10 (1%)
When stock <= 10 → Fast Pass enabled → Only queue head proceeds
```

### Trade-Offs

- Higher % → More fairness, slower final phase.
- Lower % → Faster completion, less strict fairness.

### Why Not Always FIFO-Only?

Full FIFO from start → Slower user experience.
Fast Pass → Hybrid of **speed + fairness**, ensuring efficiency for 90%+ of sale and perfect order for the last few units.

---

## 4. Design Decisions & Rationale

---

### 4.1 Rationale for Core Decisions

This architecture is built around several key design principles ensuring **fairness**, **speed**, and **scalability**:

| Principle             | Description                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FIFO Fairness**     | The timestamp-based ZSET queue ensures users are processed in strict order of arrival.                                                                                                 |
| **Fast Response**     | The API executes a lightweight `ZADD` (O(log N)) and enqueues jobs immediately, enabling thousands of requests per second.                                                             |
| **Hold System**       | Prevents double-booking and “cart sniping” while users complete payment.                                                                                                               |
| **Dual Inventory**    | Redis provides fast pre-checks, while MongoDB ensures atomic finalization and consistency.                                                                                             |
| **Atomic Operations** | `findOneAndUpdate` safeguards against race conditions and overselling.                                                                                                                 |
| **Auto-Recovery**     | Expired holds automatically release inventory to the next queued user.                                                                                                                 |
| **Manual Polling**    | Users currently call the API manually, similar to legacy reservation systems, to reduce system load. This can be replaced later with a push-based notification system such as AWS SNS. |
| **Idempotency**       | “Claim” keys (`fshc`) prevent duplicate confirmation requests from executing twice.                                                                                                    |

#### Why BullMQ?

BullMQ provides a **robust, Redis-backed job system** with delayed jobs (auto-release), retries, and rate limiting — ideal for managing queued flash sale operations.

#### Why Redis for Holds?

Redis is **low-latency and in-memory**, making it perfect for rapid reservation checks during high traffic. It prevents MongoDB from being overwhelmed by read-heavy operations, reducing cost and increasing throughput.

#### Why Nx Monorepo?

Nx efficiently manages multiple decoupled services — **API**, **Worker**, **Admin Web**, and **Customer Site** — within a single workspace. This promotes code reuse, easier dependency management, and faster prototyping.

---

### 4.2 Trade-offs & Limitations

| Decision                                 | Trade-off                                       | Mitigation                                                    |
| ---------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| **Worker Concurrency**                   | Higher concurrency can lead to lock contention. | Use distributed locks (`fslock`) and fast Redis operations.   |
| **MongoDB (No ACID Across Collections)** | Complex multi-document transaction logic.       | Use atomic operations + idempotency to ensure safety.         |
| **Redis for Holds**                      | Memory-bound and eventually consistent.         | Employ TTL expiration and dual-inventory verification.        |
| **No Payment Gateway Integration**       | Simplified demo system only.                    | Mock payment flow on frontend; integrate Stripe/PayPal later. |
| **Email-based Identity**                 | No formal authentication layer.                 | Easily replaceable with JWT or OAuth for production.          |

---

### 4.3 Production Considerations

To support large-scale, real-world flash sales, additional production optimizations are recommended:

- Implement observability and alerting for queue latency and Redis performance.
- Enable persistence and replication in Redis to protect against node failures.
- Introduce rate limiting and DDoS protection to safeguard API endpoints.
- Use centralized logging (e.g., ELK or CloudWatch) for transaction traceability.

---

### 4.4 Scalability

Currently, the system processes **~50 holds/second** with a single worker. Scaling to **1000 TPS (transactions per second)** involves:

1. **Horizontal Scaling of Services**

   - Deploy API servers via **Amazon EKS** or **EC2 Auto Scaling Groups**.
   - Use **AWS Lambda** for workers with **Provisioned Concurrency** to absorb unpredictable queue spikes.

2. **Proactive Scaling**

   - Use frontend analytics to anticipate traffic surges before sales start.
   - Auto-scale EKS/EC2 clusters or adjust Lambda concurrency proactively.

3. **Data Layer Scaling**

   - Deploy a **Redis Cluster** for distributed queue management.
   - Configure **MongoDB Replica Set** or **Sharding** for read/write scaling.

4. **API Layer Load Balancing**
   - Place an **Application Load Balancer (ALB)** or **NGINX** proxy in front of API instances.

---

### 4.5 Future Features

These features are planned for future iterations of the system:

- Distributed worker clusters and MongoDB sharding.
- CDN integration for static assets.
- Real payment gateway integration (e.g., Stripe, PayPal).
- Email notifications and observability dashboards.
- Per-IP rate limiting and anti-DDoS safeguards.
- Backup and disaster recovery strategies.
- Proper KYC and Authentication

---

## 5. Technology Stack

---

### 5.1 Current Tech Stack

The architecture is structured as an **Nx monorepo**, containing distinct applications:

- **api** – Fastify backend
- **worker** – BullMQ job processor
- **admin-web** – Bull-board UI for job monitoring
- **site-web** – Next.js frontend

#### Overview

| Layer                | Component                    | Description                                                   |
| -------------------- | ---------------------------- | ------------------------------------------------------------- |
| **Backend**          | Fastify 5.x                  | High-performance web framework for the API.                   |
| **Worker Service**   | BullMQ Worker                | Separate service that processes jobs from the queue.          |
| **Job Queue**        | BullMQ                       | Redis-backed job queue for FIFO processing.                   |
| **Primary DB**       | MongoDB                      | Primary data store with atomic operations.                    |
| **Cache / Queue DB** | Redis 7                      | Queue management, hold tracking, and caching.                 |
| **ODM**              | Mongoose                     | MongoDB ODM (used when interacting with MongoDB).             |
| **Frontend**         | Next.js 15                   | React framework for SSR/SSG (site-web).                       |
| **UI Library**       | React 19                     | UI library for building user interfaces.                      |
| **Language**         | TypeScript                   | Type-safe development across the stack.                       |
| **Auth**             | better-auth                  | Token-based authentication library (wraps JWT).               |
| **API Docs**         | @fastify/swagger             | Generates OpenAPI documentation from Fastify routes.          |
| **Monitoring**       | fastify-metrics, prom-client | Prometheus-compatible metrics for Fastify.                    |
| **Admin Dashboard**  | @bull-board                  | UI for managing and visualizing BullMQ jobs.                  |
| **Testing**          | Vitest, k6                   | Unit/component testing (Vitest) and load/stress testing (k6). |
| **Dev Tools**        | Docker Compose, Nx           | Local infrastructure setup and monorepo orchestration.        |

---

### 5.2 Cloud & Managed Alternatives

The table below outlines possible alternatives for migrating from a **self-hosted or Docker-based** setup to **cloud-managed services**.

| Component               | Current Tech Stack    | AWS Alternative                 | GCP Alternative                  | Other Managed Alternatives                     |
| ----------------------- | --------------------- | ------------------------------- | -------------------------------- | ---------------------------------------------- |
| **Database (NoSQL)**    | MongoDB               | DynamoDB, DocumentDB            | Firestore                        | MongoDB Atlas, Supabase                        |
| **Caching / Messaging** | Redis                 | ElastiCache for Redis, MemoryDB | Memorystore for Redis            | Upstash, DragonflyDB, Railway (Redis)          |
| **Job Queue**           | BullMQ (Redis-backed) | SQS, MQ for RabbitMQ            | Cloud Tasks, Pub/Sub             | RabbitMQ, Render (Redis), Fly.io (Redis)       |
| **API Server**          | Fastify / Node.js     | Lambda, Fargate, App Runner     | Cloud Run, Cloud Functions       | Railway, Render, Fly.io, Azure Functions       |
| **Worker Service**      | BullMQ Worker         | Lambda (SQS trigger), Fargate   | Cloud Run (Pub/Sub trigger)      | Railway, Render, Fly.io                        |
| **Frontend (SSR/SSG)**  | Next.js               | Amplify, S3/CloudFront          | Firebase Hosting, Cloud Run      | Vercel (Recommended), Netlify, Railway, Render |
| **Authentication**      | better-auth (JWT)     | Cognito                         | Identity Platform, Firebase Auth | Auth0, Okta, Clerk                             |
| **Admin Dashboard**     | @bull-board (Node.js) | Fargate, App Runner             | Cloud Run                        | Railway, Render (as web service)               |
| **Monitoring**          | Prometheus, Grafana   | CloudWatch, OpenSearch          | Cloud Monitoring                 | Datadog, New Relic, MongoDB Atlas Metrics      |

---

## 6. Data Flow and Models

### 6.1 Data Model (MongoDB)

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

---

### 6.2 Redis Data Structures

| Key                   | Type   | Purpose              |
| --------------------- | ------ | -------------------- |
| fsq:{saleId}          | ZSET   | Queue by timestamp   |
| fsh:{saleId}:{email}  | STRING | Hold key (900s TTL)  |
| fshc:{saleId}:{email} | STRING | Claim lock           |
| fshp:{saleId}:{email} | STRING | Hold consumed marker |
| fsinv:{saleId}        | STRING | Shadow inventory     |
| fslock:{saleId}       | STRING | Distributed lock     |
| fsmeta:{saleId}       | STRING | Metadata cache       |

### 6.3 Purchase Flow (Diagram)

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

---

## 7. Core Components

### 7.1 API Server (apps/api)

Handles all HTTP requests, manages queues, validates holds, and finalizes payments.

### 7.2 Worker Service (apps/worker)

Processes BullMQ jobs, manages holds, releases, and atomic decrements.

### 7.3 Admin Dashboard (apps/admin-web)

Admin CRUD for flash sales, order viewing, and real-time queue monitoring.

### 7.4 Customer Site (apps/site-web)

User-facing portal for viewing, joining sales, and payment confirmation.

---

## 8. Concurrency & Fairness

```mermaid
graph TB
    subgraph "Without Queue (Problem)"
        A1[1000 Concurrent Users] --> B1[(Database)]
        B1 --> C1[Race Conditions]
        B1 --> D1[Overload]
    end

    subgraph "With Queue System (Solution)"
        A2[1000 Concurrent Users] --> B2[Fast API Response]
        B2 --> C2[Redis Queue<br/>FIFO Order]
        C2 --> D2[Worker Pool<br/>Controlled Concurrency]
        D2 --> E2[(Database<br/>Sequential Access)]
        E2 --> F2[Fair Processing]
    end

    style C1 fill:#ffe1e1
    style D1 fill:#ffe1e1
    style F2 fill:#e1ffe1
```

---

## 9. Getting Started

### 9.1 Prerequisites

- Node.js 18+
- Docker Desktop
- npm or yarn

### 9.2 Installation

Before starting, **copy the environment sample file** to create your own configuration:

```bash
cp .env.sample .env
```

> ⚠️ Ensure that the values in your `.env` file correctly match your current local environment. Incorrect hostnames or credentials may cause connection issues.

Then install all dependencies:

```bash
npm install
```

---

### 9.3 Running Infrastructure

There are two main options for running the full environment.

#### Option 1: Recommended (Faster Development)

Start all infrastructure and app services together using:

```bash
npm run dev
```

> 🚀 **Tip:** `npm run dev` is optimized for speed. It automatically checks and starts all required Docker services (MongoDB, Redis, Prometheus, Grafana) and then launches all app services (API, Worker, Admin Web, Customer Site) simultaneously. This is the fastest and easiest way to begin local development.

#### Option 2: Manual Infrastructure Start

Start only the infrastructure manually first:

```bash
npm run infra:up
```

Then, start specific app components as needed (e.g., `npm run dev:api`, `npm run dev:worker`, etc.).

---

#### Services and Local URLs

| Service                              | Type          | URL                                                                                |
| ------------------------------------ | ------------- | ---------------------------------------------------------------------------------- |
| **API Server**                       | Local Node    | [http://localhost:4000](http://localhost:4000)                                     |
| **Swagger UI (Docs)**                | Documentation | [http://localhost:4000/docs](http://localhost:4000/docs)                           |
| **BullMQ Dashboard (Queue Monitor)** | Monitoring    | [http://localhost:4000/bull-mq-dashboard](http://localhost:4000/bull-mq-dashboard) |
| **Admin Web**                        | Local Node    | [http://localhost:4200](http://localhost:4200)                                     |
| **Customer Site**                    | Local Node    | [http://localhost:4201](http://localhost:4201)                                     |
| **MongoDB**                          | Docker        | `:27017`                                                                           |
| **Redis**                            | Docker        | `:6379`                                                                            |
| **Prometheus**                       | Docker        | [http://localhost:9090](http://localhost:9090)                                     |
| **Grafana**                          | Docker        | [http://localhost:3000](http://localhost:3000)                                     |

### 9.5 Creating and Testing the First Admin User

You can create your first admin user either through the **Admin Web UI** (recommended) or directly via the **API**.

---

#### Option 1: Create via Admin Web (Recommended)

1. **Open the Admin Panel Login Page:**  
   [http://localhost:4200/login](http://localhost:4200/login)

2. **Sign Up or Log In:**

   - If this is your first time, click **Sign Up** and create an admin account.
   - Otherwise, log in with your existing credentials.

3. **Access the Flash Sales Dashboard:**  
   After logging in, go to:  
   [http://localhost:4200/dashboard/flash-sales](http://localhost:4200/dashboard/flash-sales)

   - Use this page to **create and manage flash sales**.
   - Ensure your API and worker services are running before creating a sale.

4. **Test from the Customer Site:**  
   Visit the public-facing site to simulate a buyer experience:  
   [http://localhost:4201/](http://localhost:4201/)

   - Browse active sales, attempt purchases, and confirm payment flows.

---

#### Option 2: Create via API

```bash
POST /api/auth/sign-up/email
{
  "name": "admin",
  "email": "admin@admin.com",
  "password": "admin1234"
}
```

---

#### ✅ Summary

- Use the **Admin Web** for quick setup and sale creation.
- Ensure backend (`API` + `Worker`) services are running before testing.
- You can then test the full flash sale workflow end-to-end between **Admin Web** and **Customer Site**.

### 9.6 Complete Environment Variables Reference

#### Authentication & Security

| Variable               | Default                                                           | Purpose                                                                               |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **BETTER_AUTH_SECRET** | super-secret-change-in-prod                                       | Secret key for Better Auth JWT signing and encryption. Must be changed in production. |
| **BETTER_AUTH_URL**    | http://site-web:3000                                              | Base URL for Better Auth callbacks (used in Docker networking).                       |
| **JWT_SECRET**         | local-secret                                                      | Secret key for custom JWT token signing in the API. Used for admin authentication.    |
| **CLIENT_ORIGINS**     | http://localhost:4000,http://localhost:4200,http://localhost:4201 | Comma-separated list of allowed CORS origins for API requests.                        |

---

#### Database Configuration

| Variable        | Default                                                               | Purpose                                                                                      |
| --------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **MONGODB_URI** | mongodb://root:example@localhost:27017/flash_sale_db?authSource=admin | Full MongoDB connection string with credentials, host, port, database name, and auth source. |
| **MONGODB_URL** | mongodb://mongo:27017                                                 | Alternative MongoDB URL (without credentials). Used in Docker setup.                         |
| **MONGO_DB**    | flash_sale_db                                                         | Name of the MongoDB database to use. Auto-derived from MONGODB_URI if provided.              |
| **MONGO_URL**   | -                                                                     | Legacy alias for MONGODB_URI. If set, overrides other MongoDB settings.                      |

---

#### Redis & Queue Configuration

| Variable          | Default                           | Purpose                                                                      |
| ----------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| **REDIS_URL**     | redis://:redispass@localhost:6379 | Redis connection URL with password. Used for BullMQ queue and caching.       |
| **QUEUE_NAME**    | sale-processing-queue             | Name of the BullMQ queue for processing purchase reservations.               |
| **BULLMQ_PREFIX** | flashsale                         | Redis key prefix for all BullMQ data structures. Helps namespace queue data. |

---

#### Worker Configuration

| Variable                 | Default            | Purpose                                                                                                                              |
| ------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **HOLD_TTL_SECONDS**     | 900 (15 minutes)   | Time-to-live for reservation holds in seconds. How long a user has to complete payment.                                              |
| **WORKER_CONCURRENCY**   | 10                 | Number of jobs the worker processes simultaneously. Higher = faster throughput but more resource usage.                              |
| **CRITICAL_LOCK_TTL_MS** | 750 (Docker) / 200 | Lock timeout in milliseconds for critical inventory operations. Prevents deadlocks.                                                  |
| **FAST_PASS_PERCENT**    | 1                  | Percentage of inventory reserved for FIFO-only mode. When stock drops to this threshold, only the first person in queue can proceed. |

---

#### Backend API (Fastify)

| Variable      | Default   | Purpose                                                                                          |
| ------------- | --------- | ------------------------------------------------------------------------------------------------ |
| **BEND_HOST** | localhost | Hostname where the Fastify API server listens. Set to `api` in Docker.                           |
| **BEND_PORT** | 4000      | Port where the Fastify API server listens.                                                       |
| **NODE_ENV**  | -         | Standard Node.js environment flag (development, production, test). Affects logging and behavior. |

---

#### Frontend - Public Site (site-web)

| Variable                | Default                              | Purpose                                                                         |
| ----------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| **FEND_HOST**           | localhost                            | Hostname for the customer-facing site. Set to `site-web` in Docker.             |
| **FEND_PORT**           | 3000                                 | Port where the customer site Next.js server runs.                               |
| **NEXT_PUBLIC_API_URL** | Derived from BEND_HOST and BEND_PORT | Public API endpoint URL exposed to browser. Used by frontend to make API calls. |

> **Note:** `NEXT_PUBLIC_API_URL` is computed in `site-web/next.config.js`:
>
> ```js
> NEXT_PUBLIC_API_URL: `http://${process.env.BEND_HOST || 'localhost'}:${
>   process.env.BEND_PORT || 4000
> }`;
> ```

---

#### Frontend - Admin Dashboard (admin-web)

| Variable       | Default   | Purpose                                                         |
| -------------- | --------- | --------------------------------------------------------------- |
| **ADMIN_HOST** | localhost | Hostname for the admin dashboard. Set to `admin-web` in Docker. |
| **ADMIN_PORT** | 3000      | Port where the admin dashboard Next.js server runs.             |

---

#### Load Testing (K6)

| Variable                | Default          | Purpose                                                              |
| ----------------------- | ---------------- | -------------------------------------------------------------------- |
| **API_BASE**            | http://api:4000  | Base URL for K6 load testing scripts. Points to the API server.      |
| **FLASH_SALE_DURATION** | 600 (10 minutes) | Duration in seconds for flash sale scenarios in stress tests.        |
| **STARTING_QUANTITY**   | 1000             | Initial inventory count for test flash sales.                        |
| **POLLING_INTERVAL**    | 5                | Interval in seconds between queue position checks during load tests. |

---

#### Build & Development Tools

| Variable      | Default | Purpose                                                                                          |
| ------------- | ------- | ------------------------------------------------------------------------------------------------ |
| **NX_DAEMON** | false   | Controls whether Nx uses a background daemon for builds. Set to false in Docker to avoid issues. |

---

#### Environment File Structure

| File                             | Description                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **.env (Local Development)**     | Minimal configuration. Contains only Supabase credentials. Used for local development outside Docker.                                                                                |
| **.env.docker (Docker Compose)** | Complete configuration for all services. Uses Docker service names (mongo, redis, api, site-web, admin-web). Optimized for container networking. Includes K6 load testing variables. |

---

#### Critical Settings Explained

##### HOLD_TTL_SECONDS (900 = 15 minutes)

Controls the reservation window.

- Too short: Users can't complete payment.
- Too long: Inventory stays locked unnecessarily.
- **Recommendation:** 600–900 seconds (10–15 minutes).

##### WORKER_CONCURRENCY (10)

Balances throughput vs. fairness.

- Higher values: faster processing, less strict FIFO.
- Lower values: stricter FIFO, slower throughput.
- **Recommendation:** 1–10 depending on scale.

##### CRITICAL_LOCK_TTL_MS (200–750ms)

Prevents Redis deadlocks during inventory operations.

- Too short: Operations may fail under load.
- Too long: Slower recovery from failures.
- **Docker:** 750ms (higher network latency).
- **Local:** 200ms (low latency Redis).

##### FAST_PASS_PERCENT (1%)

Triggers strict FIFO when stock drops below this threshold.

- Prevents stampede at the end of sales.
- Example: 1000 units → last 10 units are FIFO-only.

---

#### Environment Variable Priority

1. **Explicit environment variable** (highest priority)
2. **.env.docker** or **.env file**
3. **Default values in code** (lowest priority)

---

## 10. Testing Strategy

### 10.1 Unit & Integration Tests (Simplified)

Use the following `npm` scripts for quick testing:

```json
{
  "test": "npm run test:api && npm run test:worker && npm run test:admin && npm run test:site",
  "test:api": "vitest --config apps/api/vitest.config.ts",
  "test:worker": "vitest --config apps/worker/vitest.config.ts",
  "test:admin": "vitest --config apps/admin-web/vitest.config.ts",
  "test:site": "vitest --config apps/site-web/vitest.config.ts"
}
```

**Descriptions**

- **`npm run test`** – Runs **all** unit tests (API, Worker, Admin Web, Site Web).
- **`npm run test:api`** – Runs API unit/integration tests via Vitest.
- **`npm run test:worker`** – Runs Worker unit tests via Vitest.
- **`npm run test:admin`** – Runs Admin Web unit tests via Vitest.
- **`npm run test:site`** – Runs Customer Site unit tests via Vitest.

### 10.2 Stress Testing

**k6** is used for performance and load testing, including smoke, stress, and soak test profiles.

#### Brief Description

`npm run k6:flash` runs a k6 load testing script that simulates a flash sale stress test scenario on your API.

Specifically, it:

- Creates a flash sale with a limited quantity (default 100 items)
- Simulates thousands of concurrent users (ramps up to 2000 virtual users over 200 seconds)
- Tests the complete purchase flow: buy attempt, queue position polling, hold securing, and order confirmation
- Measures performance metrics like success rates, response times, and end-to-end journey durations
- Validates data integrity at the end by checking if the number of paid orders matches expected quantities (detecting overbooking or underselling issues)

This test is designed to verify that your flash sale system can handle high traffic spikes without overselling inventory or failing under load.

#### Full Flash-Sale Scenario

```bash
npm run k6:flash
```

**or if running in DOCKER**

```bash
npm run k6:flash -- --options="--env API_BASE=http://api:4000"
```

**If running the API locally via `npm run dev`**

Set the `API_BASE` so the k6 container can reach your host machine:

```bash
npm run k6:flash -- --options="--env API_BASE=http://host.docker.internal:4000"
```

**Dashboards:**

- [Grafana](http://localhost:3000) is used to visualize metrics from **k6**, the **API**, the **Worker**, and **BullMQ**.

**Expected Results:**

- The system should **not overbook** (total paid orders ≤ starting quantity).
- The system should **remain responsive** under heavy concurrent load.

---

#### Expected k6 Output (Sample)

```
 █ THRESHOLDS
    http_req_duration
    ✓ 'p(95)<2000' p(95)=440.95ms
    ✓ 'p(99)<5000' p(99)=489.79ms
    http_req_failed
    ✓ 'rate<0.01' rate=0.00%
  █ TOTAL RESULTS
    checks_total.......: 3       0.011101/s
    checks_succeeded...: 100.00% 3 out of 3
    checks_failed......: 0.00%   0 out of 3
    ✓ signup 201/200
    ✓ signin 200
    ✓ sale create 201
    CUSTOM
    fs_buy_attempts................: 2143    7.929805/s
    fs_buy_success.................: 2143    7.929805/s
    fs_confirm_success.............: 1000    3.700329/s
    fs_give_ups....................: 346500  1282.164008/s
    fs_position_checks.............: 30124   111.468712/s
    fs_r_buy_success...............: 100.00% 2143 out of 2143
    fs_r_confirm_success...........: 100.00% 1000 out of 1000
    fs_t_buy_to_hold...............: avg=5126.043 min=5007   med=5008     max=32518    p(90)=5010     p(95)=5010
    fs_t_hold_to_confirm...........: avg=7.498    min=6      med=7        max=32       p(90)=9        p(95)=9
    fs_t_journey...................: avg=5133.542 min=5013   med=5016     max=32527    p(90)=5018     p(95)=5019
    HTTP
    http_req_duration..............: avg=201.82ms min=1.29ms med=178.47ms max=558.63ms p(90)=419.42ms p(95)=440.95ms
      { expected_response:true }...: avg=201.82ms min=1.29ms med=178.47ms max=558.63ms p(90)=419.42ms p(95)=440.95ms
    http_req_failed................: 0.00%   0 out of 381924
    http_reqs......................: 381924  1413.244463/s
    EXECUTION
    iteration_duration.............: avg=231.48ms min=1.44ms med=211.96ms max=32.57s   p(90)=423.37ms p(95)=446.9ms
    iterations.....................: 347500  1285.864337/s
    vus............................: 0       min=0            max=1998
    vus_max........................: 2000    min=2000         max=2000
    NETWORK
    data_received..................: 266 MB  983 kB/s
    data_sent......................: 55 MB   203 kB/s
```

---

### Quick Explanation of the K6 Test Output

#### Key Highlights

- **All thresholds passed:** Response times stayed well under limits (95th percentile: **441ms** vs 2000ms target)
- **Zero failures:** 0% HTTP request failure rate across **381,924 total requests**
- **High throughput:** System handled approximately **1,413 requests per second** with up to **2,000 concurrent users**

#### Flash Sale Metrics

- **2,143 buy attempts:** Users tried to purchase during the flash sale
- **1,000 successful purchases:** Items confirmed and paid — **100% success rate** once holds were secured
- **346,500 give-ups:** Users who couldn’t obtain inventory (expected for limited stock of 100 items)
- **5.1 seconds average:** Time from buy attempt to securing a hold
- **7.5ms average:** Time from hold to payment confirmation

#### What This Means

Your flash sale system successfully handled **massive concurrent traffic** (2,000 simultaneous users competing for 100 items), processed all successful purchases **without overselling or request failures**, and maintained **sub-second response times** under extreme load.

The high number of “give-ups” is **expected and healthy** — it shows that the queue and hold system correctly enforced fairness and prevented overselling once inventory ran out.

> 💡 In short: **The system performed flawlessly under simulated peak flash sale conditions.**

---

## 11. API Documentation

Swagger UI: [http://localhost:4000/docs](http://localhost:4000/docs)

### Public Endpoints

```
GET /flash-sales/public/sale?flashSaleId=<id>
POST /orders/buy
GET /orders/position
POST /orders/confirm
GET /orders/by-email
```

### Admin Endpoints

```
POST /flash-sales
PUT /flash-sales/:id
DELETE /flash-sales/:id
GET /orders/admin/list
GET /orders/admin/queue/:flashSaleId/overview
```

---

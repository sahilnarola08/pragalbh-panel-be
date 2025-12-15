# Performance Optimization Guide

This document outlines all the performance optimizations implemented to improve speed and reduce database costs.

## 🚀 Backend Optimizations

### 1. Response Caching Middleware
- **Location**: `src/middlewares/cache.js`
- **Features**:
  - In-memory caching for GET requests
  - Configurable TTL (Time To Live) per route type:
    - Dashboard: 5 minutes
    - Lists: 2 minutes
    - Details: 5 minutes
    - Static: 30 minutes
  - Automatic cache cleanup
  - Cache size limit (1000 entries)

### 2. Database Connection Pooling
- **Location**: `src/config/db.js`
- **Optimizations**:
  - Connection pool: 5-10 connections
  - Max idle time: 30 seconds
  - Server selection timeout: 5 seconds
  - Socket timeout: 45 seconds
  - Disabled mongoose buffering for better performance

### 3. Database Indexes
Added compound indexes to frequently queried fields:

#### Order Model
- `status + createdAt` - For status-based queries with sorting
- `clientName` - For client name searches
- `createdAt` - For date-based sorting
- `products.orderDate` - For order date filtering
- `products.orderPlatform` - For platform filtering
- `isDeleted` - For soft delete queries

#### Product Model
- `category + isDeleted` - Compound index for category queries
- `createdAt` - For date-based sorting
- `productName + isDeleted` - Compound index for search
- `isDeleted` - For soft delete queries

#### User Model
- `firstName + lastName + isDeleted` - Compound index for name searches
- `clientType + isDeleted` - For client type filtering
- `createdAt` - For date-based sorting
- `isDeleted` - For soft delete queries

#### Supplier Model
- `firstName + lastName + isDeleted` - Compound index for name searches
- `company + isDeleted` - For company filtering
- `createdAt` - For date-based sorting
- `isDeleted` - For soft delete queries

#### Master Model
- `master + isDeleted + isActive` - For master asset filtering
- `isActive + isDeleted` - For active master queries
- `createdAt` - For date-based sorting

#### Income Model
- `status + receivedAmount` - For payment queries
- `date` - For date range queries
- `orderId`, `clientId`, `status`, `mediator` - Individual indexes

#### Expense Model
- `status + paidAmount` - For expense queries
- `date`, `createdAt` - For date range queries
- `orderId`, `supplierId`, `bankId`, `status` - Individual indexes

### 4. Response Compression
- **Location**: `src/app.js`
- **Feature**: Gzip compression for all responses
- **Benefit**: Reduces response size by ~70%

### 5. Query Optimization
- Using `.lean()` for read-only queries (faster, less memory)
- Parallel queries with `Promise.all()` where possible
- Optimized aggregation pipelines
- Selective field projection (only fetch needed fields)

## 🎨 Frontend Optimizations

### 1. React Query (TanStack Query)
- **Location**: `src/hooks/useApiQuery.ts`, `src/app/providers.tsx`
- **Features**:
  - Automatic caching of API responses
  - Background refetching
  - Request deduplication
  - Optimistic updates
  - Cache invalidation on mutations

### 2. Next.js Optimizations
- **Location**: `next.config.mjs`
- **Features**:
  - Gzip compression enabled
  - SWC minification
  - Image optimization (AVIF, WebP formats)
  - Image caching (60 seconds TTL)
  - React strict mode

## 📊 Performance Improvements

### Expected Improvements:
1. **API Response Time**: 60-80% faster for cached endpoints
2. **Database Load**: 70-90% reduction in query count
3. **Network Traffic**: 70% reduction due to compression
4. **Frontend Load Time**: 40-60% faster with React Query caching
5. **Database Costs**: Significant reduction due to fewer queries

## 🔧 Usage

### Backend Cache Invalidation
When data is modified, invalidate cache:

```javascript
import { invalidateCache } from "../util/cacheHelper.js";

// After creating/updating/deleting
await invalidateCache('order', orderId);
await invalidateCache('dashboard'); // Always invalidate dashboard
```

### Frontend React Query
Use the provided hooks instead of manual fetch:

```typescript
import { useProductList } from "@/hooks/useApiQuery";

// In your component
const { data, isLoading, error } = useProductList({ page: 1, limit: 10 });
```

## 📝 Best Practices

1. **Always use `.lean()`** for read-only queries
2. **Use `Promise.all()`** for parallel independent queries
3. **Select only needed fields** with `.select()`
4. **Invalidate cache** after mutations
5. **Use React Query hooks** instead of manual fetch
6. **Monitor cache hit rates** via `X-Cache` header

## 🔍 Monitoring

### Cache Headers
- `X-Cache: HIT` - Response served from cache
- `X-Cache: MISS` - Response fetched from database

### Database Query Monitoring
Monitor slow queries in MongoDB:
```javascript
db.setProfilingLevel(1, { slowms: 100 });
db.system.profile.find().sort({ ts: -1 }).limit(10);
```

## 🚨 Important Notes

1. **Cache is in-memory**: For production, consider Redis for distributed caching
2. **Indexes take space**: Monitor database size after adding indexes
3. **Cache invalidation**: Always invalidate cache after data mutations
4. **Connection pooling**: Adjust pool size based on your server capacity

## 📈 Next Steps (Optional)

1. **Redis Integration**: Replace in-memory cache with Redis
2. **CDN**: Add CDN for static assets
3. **Database Replication**: Read replicas for heavy read operations
4. **Query Result Pagination**: Ensure all list endpoints use pagination
5. **API Rate Limiting**: Prevent abuse and reduce unnecessary requests


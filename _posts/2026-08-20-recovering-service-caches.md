---
date: 2026-08-27 11:48:00
layout: post
title: "Cache readiness and rehydration models"
subtitle: "Rebuilding a service cache from Kafka"
description: >-
  Compare Kafka replay and database snapshot recovery for rebuilding service cache without missing concurrent events.
image: >-
  https://res.cloudinary.com/dljcybafb/image/upload/blog/hydrate.jpg
optimized_image: >-
  https://res.cloudinary.com/dljcybafb/image/upload/t_To43/blog/hydrate.jpg
category: blog
tags:
  - c#
  - dotnet
  - kafka
  - distributed-systems
  - caching
author: bulatgrzegorz
paginate: false
---

# A fresh replica, ready from request #1

You push a new version of your service. Kubernetes does what it always does: starts a fresh pod, waits for it to report healthy, push traffic over, and retires the old ones. Routine stuff.

The catch is that your service keeps its entire product catalog in memory. Every replica holds the complete cache and answers queries straight from memory — no database calls. Great for latency, but a fresh process starts with an *empty* cache. And the rest of the system didn't pause while this replica was booting: products were created, updated, and deleted the whole time.

So the new replica has to rehydrate before it's useful. We want it ready to answer every query correctly from request #1 — not "correct for products that existed a minute ago", but *correct*, including the update that landed while we were still loading.

This post walks through two ways to do that rehydration, using a small .NET 10 example: a product catalog backed by Kafka, with an in-memory cache in every replica. Both approaches work. They make different trade-offs, and one of them hides a correctness trap that's easy to walk straight into.

# What recovery must guarantee

Before comparing approaches, let's pin down what "the cache is correct" actually means. It's tempting to hand-wave this as "load all the products", but recovery runs *while the system is live*, and that's where the sharp edges are. A recovery protocol is only correct if it holds these guarantees:

- **Ordering per product.** Records for a single product are applied in correct order. If a price went `100 → 90`, the cache must never settle on `100`.
- **Duplicates are harmless.** At-least-once delivery is a fact of life. Seeing the same record twice must leave the cache in the same state as seeing it once.
- **No resurrected deletes.** Once a product is deleted, an older record for it that shows up later during replay must not bring it back from the dead.
- **No queries until ready.** Until recovery reaches its target on every partition, the replica must refuse to answer product queries — a `503`, not a wrong answer.

That last point is the one people skip, and it's why the readiness probe matters so much. A replica that answers queries early isn't "eventually consistent" — it's *wrong*, and it's wrong silently.

Both recovery models we'll look at have to satisfy every one of them; the difference is *how much machinery* each needs to get there.

# The example service

The example is a product catalog service. It's covered by [functional tests](https://bulatgrzegorz.github.io/complete-guide-to-functional-tests/) against actual Kafka and PostgreSQL containers. <!-- TODO: add repo link once pushed to GitHub -->

Service exposes API:

```text
PUT    /products/{id}
DELETE /products/{id}
GET    /products/{id}
GET    /products
GET    /recovery
GET    /health/ready
```

To make things more interesting, service does follows `listen to yourself` pattern, which pros and cons will not be explain in greater details here - more about it [here - Derek Comartin](https://youtu.be/cuQ9zuNF1cI?si=Ca8WX_MysqWgC3sX) and [here - Confluent](https://youtu.be/If2W6tmDn80?si=MFaJ4xgUcrdy9te4).

Long story short: **writes don't touch the cache directly.** A `PUT` publishes the complete product state to Kafka and returns `202 Accepted` the moment Kafka acknowledges it. A `DELETE` publishes a tombstone. The endpoint doesn't update in-memory state, and it doesn't write to PostgreSQL:

```csharp
app.MapPut("/products/{id:guid}", async (Guid id, ProductInput input, ProductEventProducer producer) =>
{
    var product = new Product(id, input.Name, input.Price);
    var result = await producer.PublishAsync(product);
    return Results.Accepted($"/products/{id}", new { result.Partition, result.Offset });
});
```

The service publishes an event and then consumes its own event to update its state, exactly the same way it would consume an event produced by anyone else. The trade-off is that reads are eventually consistent — right after a `PUT`, your own `GET` might not see it yet. We accept that here.

## One log, two consumers

We have two different consumers read from kafka topic:

| Consumer | Assignment | Job |
| --- | --- | --- |
| **Local cache** | Every partition, in every replica | Build and hold the complete in-memory cache |
| **Database projector** | Shared consumer group across replicas | Divide partitions and maintain the PostgreSQL projection |

The projector uses a normal shared consumer group — Kafka splits the partitions across replicas, each record gets projected to PostgreSQL once, and retries are handled idempotently. Standard stuff.

The local cache consumer is the odd one. It does **not** use group balancing, because every replica needs the *complete* cache. If three replicas shared one group across three partitions, each replica would end up with a third of the catalog.

So the cache consumer manually assigns *every* partition to *itself*, in every replica. This is why we can't just lean on Kafka's consumer group to do recovery for us — the tool that normally divides work is exactly the tool we're refusing to use here.

## Compacted product records

![log-compaction](/assets/img/posts/cacherehydration/compressing.png)

The `products` topic is [**log-compacted**](https://docs.confluent.io/kafka/design/log_compaction.html) and uses the product ID as the key. Compaction means Kafka eventually keeps only the latest record per key, which keeps the log from growing while still letting a new consumer rebuild full state easier from offset zero.

![log-compaction](/assets/img/posts/cacherehydration/log-compaction.png)

That design choice forces another one: **every product record carries complete state**, not a delta.

```csharp
public sealed record Product(Guid Id, string Name, decimal Price);
```

If we published partial events like `ProductPriceChanged`, compaction could throw away the earlier `ProductCreated` record it depends on, and the product would be unreconstructable.

Deletion is a **tombstone**: a record with the product's key and a `null` value. Both the cache and the projector read that as "this product is gone", and compaction may eventually remove the tombstone too.

There's a third kind of record — the *drain marker* — but it only matters for the second recovery model, so I'll hold it until we get there.

# Model 1: Rebuild from Kafka

![log-compaction](/assets/img/posts/cacherehydration/please-kafka.png)

The simplest model is to rebuild whole cache from kafka topic log. If the compacted `products` topic already holds the latest state for every product, just... read all of it, then go live. No second data store, no boundary coordination — the log *is* the recovery source.

Concretely, the cache consumer does this:

1. **Discover the partitions.** Read topic metadata to get every `TopicPartition`.
2. **Capture the high watermark** for each partition — those are offsets of latest message in the topic/partition available for consumption (+ 1). This is the target.
3. **Start one worker per partition.** Each worker gets its own consumer, assigned from that partition's low watermark (the earliest offset still available).
4. **Apply records in order** — full-state products, tombstones — building the cache.
5. **Become ready** once every partition's position reaches its captured watermark.
6. **Keep going.** Every worker continues with the same consumer it used during recovery.

The whole thing is one small worker per partition. Each worker replays its partition and then, without reassigning or seeking, continues into live traffic. Partitions recover in parallel, and a slow partition doesn't block the others from reaching their own live loops.

## A compacted topic is not a snapshot

It's tempting to think a compacted topic is just "one record per key". It isn't, and two details bite if you assume otherwise.

First, **compaction is lazy.** Until it runs, the log can still contain several older records for the same key. You'll replay `price = 100` and then `price = 90` for the same product; you don't get to assume you'll only see the latest. That's fine as long as you apply them in order — the last one wins — but your code has to actually apply them in order, not dedupe on arrival.

Second, **compaction leaves gaps in the offset sequence.** (as we saw in compaction diagram above). After older records are removed, the offsets that remain aren't contiguous — you might see offsets `3`, `7`, `8`, then jump to `15`. This is the detail that trips up naive readiness checks, and it's what the next section is about.

## Knowing when the cache is ready

Here's the tempting-but-wrong way to decide you're caught up: *"wait until I've consumed the record sitting just before the end of the log".* Remember that compaction leaves gaps in the offset sequence. That final record may have been compacted away and will **never be delivered**, even though the consumer has read everything that remains.

Instead, capture the **exclusive high watermark** as the target for each partition. If the last available offset is `9`, the target is `10`. Then give every partition its own worker:

```csharp
consumer.Assign(new TopicPartitionOffset(plan.Partition, new Offset(plan.Start)));

var nextOffset = plan.Start;
while (nextOffset < plan.Target)
{
    nextOffset = ProcessRecord(consumer.Consume(stoppingToken));
}

status.PartitionReady(plan.Partition);

while (true)
{
    ProcessRecord(consumer.Consume(stoppingToken));
}
```

That's the complete lifecycle of one partition: hydrate to the captured target, report ready, then keep consuming live records with the same consumer. If `Start == Target`, the first loop is skipped, so an empty partition becomes ready immediately.

![log-compaction](/assets/img/posts/cacherehydration/consuming-partition.png)

`ProcessRecord` applies a normal record and returns `record.Offset.Value + 1`. When Kafka reports partition EOF, it returns the EOF offset instead. This is what carries the position across compaction gaps, including a compacted-away record just before the target.

The coordinator starts all partition workers in parallel. `RecoveryStatus` keeps the expected partitions and reported ready:

```csharp
public void PartitionReady(int partition)
{
    _readyPartitions.Add(partition);
    if (_readyPartitions.Count == _partitions.Count)
    {
        _ready.TrySetResult();
    }
}
```

![log-compaction](/assets/img/posts/cacherehydration/partition-status.png)

The readiness probe returns `503` until that final partition reports ready.

# Model 2: Load a database snapshot

![postgres](/assets/img/posts/cacherehydration/postgres.png)

Kafka replay is correct and simple, but its cost is tied to how much log you have to read — and in practice that log is almost always bigger than the current state it represents. It's tempting to picture a compacted topic as "one record per product," roughly the same size as the database. It rarely is.

And here's the deeper point: Kafka isn't really your source of truth — not the way you might assume. Retention is configurable: set retention.ms or a size cap and Kafka will happily discard old records.

The PostgreSQL projection, by contrast, is a genuine one-row-per-product view of current state — no history, no tombstone backlog, no retention surprises. Loading it is cheaper than replaying the whole log precisely because it's already the thing replay spends all its effort reconstructing. The pull toward "just load the database" is real.

## The tempting database race

Plan is simple:

1. Load all products from PostgreSQL
2. Start consuming Kafka from "now"

Fast, cheap, one big query and you're live. It's also broken, and the way it breaks is subtle enough that it'll pass every test you write on your laptop.

Here's the timeline. The cache consumer and the projector are independent — they read Kafka at their own pace. Watch what happens when they interleave badly:

![naive race](/assets/img/posts/cacherehydration/database-snapshot-race.png)

Read it top to bottom. Cache hydration starts, it loads the product from PostgreSQL and gets price `100`. A beat later, the projector consumes the `price = 90` record and writes it to database — but the cache already did its read, so it never saw it. Then the cache starts consuming Kafka "from now", which is *after* the `90` record's offset. That record is now behind the starting line. Nobody will ever replay it into this cache.

The result: **the cache serves price** `100`. There's no later event that fixes it, because the fixing event is exactly the one that fell into the gap.

![what if](/assets/img/posts/cacherehydration/whatif.png)
*What if I subscribe first, then load the database?*

The obvious fix is to flip the order: start consuming Kafka before you read the snapshot, so anything that lands during the load gets captured. Load the snapshot, apply it, then apply everything you buffered. Surely nothing can fall through now?

It still can — because you've fixed the wrong gap. The window that matters isn't between **when you subscribe** and **when you read the database**. It's between **where the projector was when it built that snapshot** and **where you started consuming**. And the projector is a separate consumer reading at its own pace, so you have no idea where that is.

![naive race](/assets/img/posts/cacherehydration/database-snapshot-race-2.png)

Offset 11 is in neither place: too late for the snapshot, too early for your subscription. It's gone. Subscribing first bought you nothing, because the boundary you needed to align with was the projector's position, not the clock.

You could dodge this by subscribing from the very beginning of the log — but then you're replaying everything, which is just Model 1 with extra steps. The only way to make "subscribe first" correct and cheap is to know the snapshot's exact offset per partition. Which is precisely the thing we're about to build.

This single race is why this whole post exists. Both recovery models are really just two different answers to one question: **where, exactly, do I start replaying Kafka so that it lines up perfectly with the state I loaded?** Get that boundary wrong and you get silent, permanent staleness. Get it right and everything else falls into place.

## Why load-then-consume races

But we saw where "just load the database and start Kafka from now" leads: silent, permanent staleness. So the entire trick of this model is replacing that fuzzy "now" with an **exact, verifiable starting offset per partition**. That mechanism is the one coined term in this whole post: the **drain marker**.

Quick recap, because it's the thing the drain marker exists to fix. The snapshot was built by the projector reading Kafka up to *some* position. When you then start the cache consumer "from now", you have no idea how that "now" relates to the position the snapshot reflects. If the projector was lagging, records it hadn't gotten to yet are neither in the snapshot *nor* after your start offset. They vanish.

To load a snapshot safely, you need to answer one question precisely: **exactly which Kafka offset does this snapshot correspond to, on each partition?** Then you start replay from *there*, not from "now".

## The drain marker

Here's the move. Before loading the snapshot, the recovering cache writes a special record — a **drain marker** — directly to *every* partition of the `products` topic. Then it waits until it can see, that the projector has processed each of those markers.

Why does that work? The projector consumes each partition in order, one record at a time, committing to PostgreSQL as it goes. So when a marker appears in PostgreSQL, it's *proof* that every record before it on that partition has already been committed to the projection. The marker "drains" the pipeline up to that point — hence the name.

That gives us the exact offset we were missing. For each partition, the marker's offset is the boundary: everything at or before it is guaranteed to be in the snapshot; everything after it is what we need to replay.

![drain marker](/assets/img/posts/cacherehydration/drain-marker.png)


A few things make this robust in practice:

- **One marker per partition.** Kafka only orders records within a partition, so the boundary isn't a single global offset — it's a *vector*, one offset per partition. Every partition has to participate.
- **PostgreSQL, not Kafka, is the proof.** Seeing the marker come back on the Kafka topic would only tell us the marker was written. We specifically wait for the *projector* to have persisted it, because that's what proves the snapshot is caught up.
- **A unique recovery ID.** Each drain marker is created with a fresh GUID, so multiple replicas can recover concurrently without confusing each other's boundaries. After recovery, those temporary marker keys get tombstoned so compaction cleans them up.

So the snapshot recovery flow becomes: write markers → wait for them in PostgreSQL → capture readiness targets (current high watermarks) → load the snapshot → assign each partition at `marker offset + 1` → replay up to the targets → go live.

<!-- TODO: why capture readiness targets? -->

## Handling snapshot overlap

There's one more wrinkle, and it's the reason the snapshot rows carry offset metadata.

The projector doesn't stop when it processes a marker — it keeps consuming. So between the moment the marker is persisted and the moment we actually run the snapshot query, the projector may have advanced *past* the marker and save newer state. Concretely:

![overlap](/assets/img/posts/cacherehydration/overlap.png)

Our boundary says "replay from offset 12" (`marker offset + 1`). But the snapshot we loaded *already contains* price `90` from offset `12`, because the projector got there first. 

As we do not want to overwrite snapshot data with already stale messages, the guard is simple: **every cached entry remembers the partition and offset it came from, and we refuse to apply any record that isn't strictly newer.** Each snapshot row loads its `source_partition` and `source_offset`, and replay compares against them.

Here's the actual apply method:

```csharp
if (products.TryGetValue(productId, out var current))
{
    if (current.SourcePartition != record.Partition.Value)
    {
        throw new InvalidOperationException(
            $"Product {productId} moved from partition {current.SourcePartition} " +
            $"to {record.Partition.Value}. Offset versions are no longer comparable.");
    }

    if (current.SourceOffset >= record.Offset.Value)
    {
        return CacheApplyResult.SkippedAsOlder;
    }
}

if (record.Message.Value is null)
{
    products[productId] = new CachedProduct(null, IsDeleted: true, record.Partition.Value, record.Offset.Value);

    return CacheApplyResult.TombstoneApplied;
}

var product = ProductRecord.DeserializeProduct(record.Message.Value);
products[productId] = new CachedProduct(product, IsDeleted: false, record.Partition.Value, record.Offset.Value);

return CacheApplyResult.Applied;
```

The heart of it is these three lines:

```csharp
if (current.SourceOffset >= record.Offset.Value)
{
    return CacheApplyResult.SkippedAsOlder;
}
```

If the cache already holds this product at an offset equal to or newer than the incoming record, the record is dropped as stale. That's what makes the overlap safe: replaying offset `12` on top of a snapshot that already reflects offset `12` is a no-op, and an older straggler can never overwrite newer state.

Two supporting details fall out of the same design. Tombstones keep their offset too — a deleted product stays in the cache as a deletion marker with its `source_offset`, so an older "product exists" record can't resurrect it (that's the *no resurrected deletes* guarantee, enforced by the exact same comparison). And if a product ever shows up on a *different* partition than the cache recorded, we throw — offsets across partitions aren't comparable, and that situation means someone repartitioned the topic, which this model deliberately doesn't support.

The one thing I'm *not* showing here is how markers get persisted on the projector side — the `recovery_markers` table, the upsert, the transaction that commits a product and its checkpoint together. It's necessary for the mechanism but it's mechanical; it lives in the example repo.

# Comparing the recovery models

![architecture](/assets/img/posts/recovering-service-caches/architecture.png)
<!-- TODO: excalidraw — system architecture: API replica, local cache, Kafka, PostgreSQL projection. -->

Both models end at the same place — a complete, correct cache that transitions cleanly into live consumption. What differs is everything *around* that. I'll keep this qualitative on purpose; the example repo has a seeding scenario that measures real numbers for 100k and 1M products, but numbers depend so heavily on your log size, hardware, and partition count that quoting them here would be misleading.

| Dimension | Kafka replay | Database snapshot |
| --- | --- | --- |
| **Recovery dependencies** | Kafka only | Kafka *and* PostgreSQL |
| **Correctness complexity** | Lower — one worker and boundary per partition | Higher — markers, snapshot, overlap guard |
| **Work performed at startup** | Read the whole retained log | One projection query + a short overlap replay |
| **Kafka traffic per replica** | Higher (full log, every replica) | Lower (only the overlap after the marker) |
| **Database load at startup** | None | A full-projection read on every replica start |
| **Schema compatibility window** | Must decode the entire retained history | Reduced — but still must decode records after the marker |
| **Failure coordination** | Just partition positions | Markers *plus* snapshot *plus* positions |
| **Best fit** | Moderate retained log | Large history, or a strict startup-time SLA |

A few of these deserve a sentence.

**Correctness complexity is the big one.** Kafka replay has a single moving part: read to the watermark, go live. The snapshot model adds a coordination protocol (the drain marker) *and* a versioning guard (source offsets), and both have to be right or you get silent staleness. You don't get the cheaper startup for free — you pay for it in machinery you have to keep correct.

**Traffic direction flips.** Replay pushes load onto Kafka — every replica reads the whole log. The snapshot pushes load onto PostgreSQL — every replica runs a full projection read. Which one you'd rather stress depends on which system has headroom.

**Schema evolution bites both, differently.** Replay has to be able to deserialize *every* record still in the retained log, which over a long retention window can mean years-old formats. The snapshot shrinks that window to "records since the marker", but it doesn't eliminate it — you still replay the overlap, so you still need to read those records.

# Which model should you choose?

Start with Kafka replay. It's the default, and it should stay the default until something forces you off it. It has one dependency, one moving part, and a correctness model you can hold in your head. Most services with a moderate retained log will never need anything more.

Reach for the database snapshot only when a concrete pressure pushes you there:

- **Your retained log is large.** If replaying the full history takes minutes and you're spinning replicas up and down often, that cost compounds. A snapshot turns "read everything" into "read one query plus a small overlap".
- **You have a strict startup-time SLA.** If a new replica *must* be serving traffic within some tight budget, and replay can't reliably hit it, the snapshot buys you a faster start.
- **Kafka is the constrained resource.** If your brokers are already hot and you can't afford every replica re-reading the whole log, moving that load to PostgreSQL may be the pragmatic trade.

And here's the important part: **if those pressures do push you to the snapshot, you have to implement it *correctly* — which means the drain marker and the overlap guard, not "load the database and start from now".** The naive version isn't a simpler snapshot; it's a broken one. The moment you choose a snapshot, you've signed up for the full coordination protocol. There's no cheap middle ground.

# Wrapping up

The thing I want to leave you with is the shape of the problem, not the specific mechanism. A cold cache isn't hard to *fill* — it's hard to fill *while the world keeps moving*. Every correct answer comes down to defining one precise boundary: the exact point where "state I already have" meets "records I still need to replay".

Kafka replay defines that boundary as the high watermark you froze at startup. The database snapshot defines it as the drain marker's offset per partition. Different boundaries, same job.

Which is why the snapshot never lets you skip replay. **A snapshot only changes *where* replay starts — it never removes the need to replay, and it never removes the need for a correctness boundary.** If you find yourself reaching for "load the database and start consuming from now", that's the tell that the boundary got hand-waved, and that's exactly where the silent staleness lives.

So: default to Kafka replay, graduate to a snapshot when the numbers force you to, and when you do, respect the boundary. Your process being up was never the goal. Your cache being *correct* is. 🫡

The full, runnable example — both recovery models, the functional tests against real Kafka and PostgreSQL, and the data-seeding scenario — lives here: <!-- TODO: add final example repository link once pushed to GitHub -->

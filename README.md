# Lab with MongoDB Replica Set and Fake Network Latency

In this lab, we explore the functionality of a MongoDB replica set under simulated network latency conditions using the `tc` tool. This setup allows developers and database administrators to understand read and write concerns without needing to deploy a geographically distributed cluster.

## Starting the Cluster

To initiate the cluster, use the following commands:

```

docker compose up --build -d
docker compose logs init-replica-set
docker compose exec -it mongo1 mongosh

```

These commands will build and start your Docker containers while initializing the replica set.

The command `docker compose logs init-replica-set` helps you monitor the initialization process and shows latency during heartbeats, such as `pingMs: 1001`. 
With a configured latency of 500ms on each node, the total Round Trip Time (RTT) reaches 1000ms.

## Testing Write Concerns with Timeout

To test write concerns effectively, particularly the majority write concern, you can run the following query:
```
db.myCollection.insertOne({name: "example"}, {writeConcern: {w: "majority", wtimeout: 5000}});
```

This successfully inserts a document into `myCollection` with a write concern of majority and a timeout of 5000 milliseconds, sufficient for the current RTT. 
However, if you reduce the timeout to 1000 milliseconds:
```
db.myCollection.insertOne({name: "example"}, {writeConcern: {w: "majority", wtimeout: 1000}});
```

You will encounter a `MongoWriteConcernError`, indicating that the operation timed out waiting for replication. 
This illustrates the importance of understanding the relationship between write concerns and network latency.

Here is the full output:
```

rs0 [direct: primary] test> db.myCollection.insertOne({name: "example"}, {writeConcern: {w: "majority", wtimeout: 5000}});

{
  acknowledged: true,
  insertedId: ObjectId('67dbe0df877a91812ad09e64')
}

rs0 [direct: primary] test> db.myCollection.insertOne({name: "example"}, {writeConcern: {w: "majority", wtimeout: 1000}});

Uncaught:
MongoWriteConcernError[WriteConcernFailed]: waiting for replication timed out

Additional information: {
  wtimeout: true,
  writeConcern: { w: 'majority', wtimeout: 1000, provenance: 'clientSupplied' }
}
Result: {
  n: 1,
  electionId: ObjectId('7fffffff0000000000000001'),
  opTime: { ts: Timestamp({ t: 1742463205, i: 1 }), t: Long('1') },
  writeConcernError: {
    code: 64,
    codeName: 'WriteConcernFailed',
    errmsg: 'waiting for replication timed out',
    errInfo: {
      wtimeout: true,
      writeConcern: { w: 'majority', wtimeout: 1000, provenance: 'clientSupplied' }
    }
  },
  ok: 1,
  '$clusterTime': {
    clusterTime: Timestamp({ t: 1742463205, i: 1 }),
    signature: {
      hash: Binary.createFromBase64('AAAAAAAAAAAAAAAAAAAAAAAAAAA=', 0),
      keyId: Long('0')
    }
  },
  operationTime: Timestamp({ t: 1742463205, i: 1 })
}
rs0 [direct: primary] test> 
```

## Analyzing Read/Write Consistency

To observe the effects of different write concerns on data consistency, execute:
```

docker compose exec -it mongo1 mongosh -f /scripts/read-and-write.js

```

Setting the write concern to majority ensures consistency across nodes, albeit with some write latency. The output shows the values and elapsed times for reads and writes, demonstrates how replicas lag and shows stale values when not appropriately synchronized. This experiment highlights the critical balance between performance and consistency in distributed database systems.

With the write concern set to the majority (with environment variable `w=majority` which sets the write concern to `{ w: majority }`), the values are consistent in all nodes, but the writes involve two round-trip latency:

<img width="1393" alt="image" src="https://github.com/user-attachments/assets/aaa67e45-6e8b-45d7-a64a-4c108361e202" />

Without waiting on other nodes during writes (with environment variable `w=0`, which sets the write concern to `{ w: 0 }`) the replicas lag and show stale values but writes do not involve waiting for network synchronization:

<img width="1418" alt="image" src="https://github.com/user-attachments/assets/ffdf5ccf-d7b3-473b-912d-a90d302280d4" />






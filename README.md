# Lab with MongoDB Replica Set and fake network latency

This cluster adds fake network latency (using `tc`) to learn about read and write concerns without having to deploy a cluster over multiple regions.

## Start it

```

docker compose up --build -d
docker compose logs init-replica-set
docker compose exec -it mongo1 mongosh

```

`docker compose logs` shows the latency during hearbeats,: `pingMs: 1001, lastHeartbeatMessage`

For a latency of 500ms added on all nodes, the Round Trip Time is 1000ms

## Test with timeout

You can test with a write concern of majority and timeout lower than the RTT:
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

## Examples of read/write consistency

```

docker compose exec -it mongo1 mongosh -f /scripts/read-and-write.js

```

With the write concern set to majority (with environment variable `w=majority`), the values are consistent in all nodes, but with some write latency:

<img width="1435" alt="image" src="https://github.com/user-attachments/assets/be8acbb5-aae6-4679-b712-b2b5ce284e4e" />


Without waiting on other nodes during writes, the replicas lag and show stale values:

<img width="1418" alt="image" src="https://github.com/user-attachments/assets/ffdf5ccf-d7b3-473b-912d-a90d302280d4" />






# lab with MongoDB Replica Set and fake network latency

```

docker compose up --build -d
docker compose logs init-replica-set
docker compose exec -it mongo1 mongosh

```

`docker compose logs` shows the latency during hearbeats,: `pingMs: 1001, lastHeartbeatMessage`


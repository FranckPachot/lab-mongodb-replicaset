#export NETEM_DELAY_MS=200 
#export FSYNC_DELAY_MS=0 
docker compose up -d --scale client=0

pkill -f "/scripts/tailOplog.js"
(
docker exec rs-mongo-1 mongosh rs-mongo-1 --eval 'const num="1️⃣"' /scripts/tailOplog.js &
docker exec rs-mongo-2 mongosh rs-mongo-2 --eval 'const num="2️⃣"' /scripts/tailOplog.js &
docker exec rs-mongo-3 mongosh rs-mongo-3 --eval 'const num="3️⃣"' /scripts/tailOplog.js &
) | grep -v config.system.session  &

docker exec rs-mongo-1 mongosh "mongodb://rs-mongo-1:27017,rs-mongo-2:27017,rs-mongo-3:27017/test?replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=true&w=majority&journal=true" --eval '
db.myCollection.drop()
'

docker exec rs-mongo-1 mongosh "mongodb://rs-mongo-1:27017,rs-mongo-2:27017,rs-mongo-3:27017/test?replicaSet=rs0" --eval '
 db.myCollection.insertOne({name: "old"}, {writeConcern: {w: "1", wtimeout: 15000}});
 '  
for i in {5..1}
do
 echo "=== Insert in $i seconds..."
 sleep 1
done
echo "===   disconnect 3️⃣  $(date -u +'%Y-%m-%dT%H:%M:%S.%N')" && docker network disconnect rs_default rs-mongo-3
echo "===   disconnect 2️⃣  $(date -u +'%Y-%m-%dT%H:%M:%S.%N')" && docker network disconnect rs_default rs-mongo-2
(
echo "===   before insert $(date -u +'%Y-%m-%dT%H:%M:%S.%N')"
#docker exec rs-mongo-1 mongosh "mongodb://rs-mongo-1:27017,rs-mongo-2:27017,rs-mongo-3:27017/test?replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=true&w=majority&journal=true" --eval '
docker exec rs-mongo-1 mongosh "mongodb://rs-mongo-1:27017,rs-mongo-2:27017,rs-mongo-3:27017/test?replicaSet=rs0" --eval '
 db.myCollection.insertOne({name: "new"}, {writeConcern: {w: "1", wtimeout: 15000}});
 '  
echo "===    after insert $(date -u +'%Y-%m-%dT%H:%M:%S.%N')"
) &
sleep 5
docker exec rs-mongo-1 mongosh "mongodb://rs-mongo-1:27017,rs-mongo-2:27017,rs-mongo-3:27017/test?replicaSet=rs0" --eval 'db.myCollection.find()'  
echo "=== disconnect 1️⃣  $(date -u +'%Y-%m-%dT%H:%M:%S.%N')" && docker network disconnect rs_default rs-mongo-1
echo "=== reconnect 2️⃣  $(date -u +'%Y-%m-%dT%H:%M:%S.%N')" && docker network    connect rs_default rs-mongo-2
sleep 5
docker exec rs-mongo-2 mongosh "mongodb://rs-mongo-1:27017,rs-mongo-2:27017,rs-mongo-3:27017/test?replicaSet=rs0" --eval 'db.myCollection.find()'  
echo "=== reconnect 3️⃣  $(date -u +'%Y-%m-%dT%H:%M:%S.%N')" && docker network    connect rs_default rs-mongo-3
docker exec rs-mongo-2 mongosh "mongodb://rs-mongo-1:27017,rs-mongo-2:27017,rs-mongo-3:27017/test?replicaSet=rs0" --eval 'db.myCollection.find()'  
echo "=== reconnect 1️⃣  $(date -u +'%Y-%m-%dT%H:%M:%S.%N')" && docker network    connect rs_default rs-mongo-1
docker exec rs-mongo-1 mongosh "mongodb://rs-mongo-1:27017,rs-mongo-2:27017,rs-mongo-3:27017/test?replicaSet=rs0" --eval 'db.myCollection.find()'  

sleep 10
pkill -f "/scripts/tailOplog.js"


docker exec -i rs-mongo-1 mongosh 'mongodb://rs-mongo-1:27017/test?directConnection=true&connectTimeoutMS=3000&serverSelectionTimeoutMS=3000&socketTimeoutMS=3000&w=majority&journal=true&&readConcernLevel=majority' <<'JS'
function tsEpoch(date = new Date()) { return date.toISOString() + " " + Date.now(); }
function printCommitPoint() {
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  const status = db.adminCommand({ replSetGetStatus: 1 });
  print(`${tsEpoch()} [DEBUG] Commit points:`);
  Object.entries(status.optimes).forEach(([key, value]) => {
    print(`    ${key}: ${JSON.stringify(value)}`);
  });
  status.members.forEach(m => {
    print(
      `${tsEpoch()} [DEBUG] Member ${m.name} (state: ${m.stateStr}): optime=${JSON.stringify(m.optime)}, optimeDate=${JSON.stringify(m.optimeDate)}`
    );
  });
}
// Microservice B (Reader) – no explicit readConcern here
async function microserviceB(expectedId, readDelayMs = 0) {
  if (readDelayMs > 0) { await sleep(readDelayMs); }
  print(`${tsEpoch()} [B] Reading ${expectedId}`);
  const doc = await db.getCollection("event").findOne({ _id: expectedId });
  print(`${tsEpoch()} [B] Found: ${doc ? JSON.stringify(doc) : "NOT FOUND"}`);
  printCommitPoint();
}
// Microservice A (Writer) – no explicit writeConcern here
async function microserviceA(eventId) {
  print(`${tsEpoch()} [A] Inserting ${eventId}`);
  await db.getCollection("event").insertOne({ _id: eventId, createdAt: new Date() });
  print(`${tsEpoch()} [A] Finished insert for ${eventId}`);
}
// Run one case (parallel insert + read)
async function runCase(eventId, readDelayMs) {
  const writerPromise = microserviceA(eventId);
  const readerPromise = microserviceB(eventId, readDelayMs);
  await Promise.all([writerPromise, readerPromise]);
}
async function main() {
  // Clean start
  await db.getCollection("event").deleteMany({});
  await runCase("xxx", 0);
  await sleep(1500);
}
main();
JS


exit





cfg = rs.conf();  
  
// Member [0] is primary by default — leave it alone  
// Member [1] and [2] become lagged, ineligible secondaries  
  
cfg.members[1].priority = 0;  
cfg.members[1].secondaryDelaySecs = 10;  
  
cfg.members[2].priority = 0;  
cfg.members[2].secondaryDelaySecs = 10;  
  
rs.reconfig(cfg);  


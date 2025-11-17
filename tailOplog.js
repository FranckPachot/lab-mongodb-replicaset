const replStatus = rs.status();  
const replName = replStatus.set;  
print(`Replica set: ${replName}`);  
  
let lastTS = null
const sleepMs = 10;  

lastTS = db.getSiblingDB('local').oplog.rs
    .find()
    .sort({ ts: -1 })
    .limit(1)
    .toArray()[0].ts
;
  
while (true) {  
 let query = {};  
  if (lastTS) {  
    query = { ts: { $gt: lastTS } };  
  }  

 try {
  
  const cursor = db.getSiblingDB('local').oplog.rs  
    .find(query)  
    .sort({ ts: 1 });  
  
  while (cursor.hasNext()) {  
    const doc = cursor.next();  
    lastTS = doc.ts; 
  
    const isoDate = doc.ts.getHighBits() > 0  
      ? new Date(doc.ts.getHighBits() * 1000).toISOString()  
      : "(no date)";  
  
    print(`${num}  ${db.hello().me} ${new Date().toISOString()} term=${doc.t} ns=${doc.ns} op=${doc.op} ${EJSON.stringify(doc)}`);  
    sleep(1000);  
  }  
 } catch (e) {
  print(`Oplog read failed: ${e.message}...`);
  continue;
 }
  
  sleep(sleepMs);  
}  


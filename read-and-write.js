const connections = {    
  "🔢": 'mongodb://rs-mongo-1:27017,rs-mongo-2:27017,rs-mongo-3:27017/test?replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=true&w=majority',    
  "1️⃣": 'mongodb://rs-mongo-1:27017/test?directConnection=true&connectTimeoutMS=900&serverSelectionTimeoutMS=500&socketTimeoutMS=300&w=majority',    
  "2️⃣": 'mongodb://rs-mongo-2:27017/test?directConnection=true&connectTimeoutMS=900&serverSelectionTimeoutMS=500&socketTimeoutMS=300&w=majority',    
  "3️⃣": 'mongodb://rs-mongo-3:27017/test?directConnection=true&connectTimeoutMS=900&serverSelectionTimeoutMS=500&socketTimeoutMS=300&w=majority',    
};    
  
function padLeft(string, length) {    
  return string.padStart(length);    
}    
  
function findPrimary(dbs) {    
  for (const [name, db] of Object.entries(dbs)) {    
    try {    
      const status = db.getDB('admin').runCommand({ isMaster: 1 });    
      if (status.ismaster) {    
        return name;    
      }    
    } catch (error) {    
      console.error(`Error checking primary status on ${name}: ${error}`);    
    }    
  }    
  return null;    
}    
  
function performRead(db, nodeName, expectedValue) {    
  const collection = db.getCollection("testCollection");    
  const readStart = Date.now();    
  try {    
    const document = collection.find({ key: process.env.HOSTNAME }).limit(1).next();    
    const readEnd = Date.now();    
    const readDuration = readEnd - readStart;    
    const readValue = document ? document.value : '';    
    const readOutput = `${padLeft(readValue.toString(), expectedValue.toString().length)} from ${nodeName} ${expectedValue<=readValue?"✅":"🚫"}(${padLeft(readDuration.toString(),5)}ms)`;    
    return { readOutput, document };    
  } catch (error) {    
    const readEnd = Date.now();    
    const readDuration = readEnd - readStart;    
    console.error(`Error in read operation from ${nodeName}: ${error} (${padLeft(readDuration.toString(),5)}ms)`);    
    const readOutput = `${padLeft("", expectedValue.toString().length)} from ${nodeName} ⛔️(${padLeft(readDuration.toString(),5)}ms)`;    
    const document = null;    
    throw error; // Let the caller know we need to reconnect    
  }    
}    
  
async function connectOne(name, uri) {  
  const connectStart = Date.now();  
  try {  
    const mongo = new Mongo(uri);  
    const connectEnd = Date.now();  
    const connectDuration = connectEnd - connectStart;  
    const role = mongo.getDB('admin').runCommand({ isMaster: 1 }).ismaster ? 'primary  ' : 'secondary';  
    console.log(`Connected to ${name} (${padLeft(connectDuration.toString(),5)}ms) where ${role} is available`);  
    return mongo;  
  } catch (e) {  
    const connectEnd = Date.now();  
    const connectDuration = connectEnd - connectStart;  
    console.error(`Could not connect to ${name} (${padLeft(connectDuration.toString(),5)}ms): ${e}`);  
    return null;  
  }  
}  
  
async function main() {  
  // Track connection states by node name  
  const dbs = {};  
  for (const [name, uri] of Object.entries(connections)) {  
    dbs[name] = await connectOne(name, uri);  
  }  
  
  let loopNumber = 1;  
  // Wait until at least one is up and primary found  
  while (Object.values(dbs).every(v => !v) || !findPrimary(dbs)) {  
    for (const [name, uri] of Object.entries(connections)) {  
      if (!dbs[name]) dbs[name] = await connectOne(name, uri);  
    }  
    await new Promise(r => setTimeout(r, 5000));  
  }  
  const primaryNode = findPrimary(dbs);  
  const primaryDb = dbs[primaryNode].getDB("test");  
  const collection = primaryDb.getCollection("testCollection");  
  collection.updateOne( { key: process.env.HOSTNAME }, { $set: { value: 0 } }, { upsert: true } );  
  
  while (true) {  
    const timestamp = (new Date()).toISOString();  
    let writeOutput = '';  
    let currentPrimaryNode = findPrimary(dbs);  
    if (currentPrimaryNode) {  
      let currentCollection;  
      try {  
        currentCollection = dbs[currentPrimaryNode].getDB("test").getCollection("testCollection");  
      } catch (e) {  
        // If primary connection is gone, reconnect!  
        dbs[currentPrimaryNode] = await connectOne(currentPrimaryNode, connections[currentPrimaryNode]);  
        continue;  
      }  
      const writeStart = Date.now();  
      try {  
        const updateResult = currentCollection.findOneAndUpdate(  
          { key: process.env.HOSTNAME },  
          { $set: { value: loopNumber } },  
          { upsert: true , returnDocument: 'before'}  
        );  
        const writeEnd = Date.now();  
        const writeDuration = writeEnd - writeStart;  
        const previousValue=updateResult.value ? updateResult.value : 0;  
        writeOutput = `${loopNumber} to ${currentPrimaryNode} ${previousValue==loopNumber-1?"✅":"🚫"}(${padLeft(writeDuration.toString(),5)}ms)`;  
        loopNumber++;  
      } catch (error) {  
        const writeEnd = Date.now();  
        const writeDuration = writeEnd - writeStart;  
        writeOutput = `${padLeft("",loopNumber.toString().length)} to ${currentPrimaryNode} ⛔️(${padLeft(writeDuration.toString(),5)}ms)`;  
        console.error(`Error in write operation on ${currentPrimaryNode}: ${error} (${padLeft(writeDuration.toString(),5)}ms)`);  
        // Try to reconnect on write error  
        dbs[currentPrimaryNode] = await connectOne(currentPrimaryNode, connections[currentPrimaryNode]);  
      }  
    } else {  
      writeOutput = 'write error: no primary';  
    }  
    // For reads, attempt, and if error, reconnect only that node  
    const readPromises = Object.entries(connections).map(async ([name, uri]) => {  
      if (!dbs[name]) {  
        dbs[name] = await connectOne(name, uri);  
        if (!dbs[name]) return { readOutput: `${padLeft("", loopNumber.toString().length)} from ${name} ⛔️(n/a)` };  
      }  
      try {  
        return performRead(dbs[name].getDB("test"), name, loopNumber-1);  
      } catch (err) {  
        // If it errors, reconnect (non-blocking for others)  
        dbs[name] = await connectOne(name, uri);  
        return { readOutput: `${padLeft("", loopNumber.toString().length)} from ${name} ⛔️(reconnect)` };  
      }  
    });  
    const results = await Promise.all(readPromises);  
    const readOutputs = results.map(({ readOutput }) => readOutput).join(' ');  
    console.log(`${timestamp} Write ${writeOutput} Read ${readOutputs} client ${process.env.HOSTNAME}`);  
  
    // Optional: small delay to avoid busy-loop  
    await new Promise(r => setTimeout(r, 500));  
  }  
}  
  
main();  

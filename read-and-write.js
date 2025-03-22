
 // this will be read in order (I think) so place the multi-host first if you want to use it for writes
 // the host names take the project name (in .env) and the service name (in docker-compose.yaml) and the replica number
 const connections = {
  "🔢": 'mongodb://rs-mongo-1:27017,rs-mongo-2:27017,rs-mongo-3:27017/test?replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=true&w=majority',
  "1️⃣": 'mongodb://rs-mongo-1:27017/test?directConnection=true&connectTimeoutMS=9000&serverSelectionTimeoutMS=2000&socketTimeoutMS=1500&w=majority',
  "2️⃣": 'mongodb://rs-mongo-2:27017/test?directConnection=true&connectTimeoutMS=9000&serverSelectionTimeoutMS=2000&socketTimeoutMS=1500&w=majority',
  "3️⃣": 'mongodb://rs-mongo-3:27017/test?directConnection=true&connectTimeoutMS=9000&serverSelectionTimeoutMS=2000&socketTimeoutMS=1500&w=majority',
};
console.log(connections);

// formatting
function padLeft(string, length) {
 return string.padStart(length);
}

// find the first connection string that has a primary available
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

// perform a read operation on a given node and compare the result to the expected value
function performRead(db, nodeName, expectedValue) {
 const collection = db.getCollection("testCollection");
 const readStart = Date.now();
 try {
   const document = collection.find({ key: 'one' }).limit(1).next();
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
   return { readOutput, document };
 }
}

// connect and loop forever writing to the primary and reding from all nodes
async function main() {

 const dbs = Object.entries(connections).reduce((acc, [name, uri]) => {
   const connectStart = Date.now();
   try {
     const mongo = new Mongo(uri);
     acc[name] = mongo;
     const connectEnd = Date.now();
     const connectDuration = connectEnd - connectStart;
     const role = mongo.getDB('admin').runCommand({ isMaster: 1 }).ismaster ? 'primary  ' : 'secondary';
     console.log(`Connected to ${name} (${padLeft(connectDuration.toString(),5)}ms) where ${role} is available`);
   } catch (e) {
     const connectEnd = Date.now();
     const connectDuration = connectEnd - connectStart;
     console.error(`Could not connect to ${name} (${padLeft(connectDuration.toString(),5)}ms): ${e}`);
   }
   return acc;
 }, {});

 let loopNumber = 1;
   // gets the connection strin where a primary is available
   const primaryNode = findPrimary(dbs);
   const primaryDb = dbs[primaryNode].getDB("test");
   const collection = primaryDb.getCollection("testCollection");
   collection.updateOne( { key: 'one' }, { $set: { value: 0 } }, { upsert: true });
 while (true) {
   const timestamp = (new Date()).toISOString();

   let writeOutput = '';
   if (primaryNode) {
     const writeStart = Date.now();
     try {
       const updateResult = collection.findOneAndUpdate(
        { key: 'one', },
        { $set: { value: loopNumber } },
        { upsert: true , returnDocument: 'before'}
       );
       const writeEnd = Date.now();
       const writeDuration = writeEnd - writeStart;
       const previousValue=updateResult.value ? updateResult.value : 0;
       writeOutput = `${loopNumber} to ${primaryNode} ${previousValue==loopNumber-1?"✅":"🚫"}(${padLeft(writeDuration.toString(),5)}ms)`;
       loopNumber++;
     } catch (error) {
       const writeEnd = Date.now();
       const writeDuration = writeEnd - writeStart;
       writeOutput = `primary: ${primaryNode} write error`;
       writeOutput = `${padLeft("",loopNumber.toString().length)} to ${primaryNode} ⛔️(${padLeft(writeDuration.toString(),5)}ms)`;
       console.error(`Error in write operation on ${primaryNode}: ${error} (${padLeft(writeDuration.toString(),5)}ms)`);
     }
   } else {
     writeOutput = 'write error: no primary';
   }
   // after the write, read from all nodes
   const readPromises = Object.entries(dbs).map(async ([name, db]) => {
     if (db) {
      return performRead(db.getDB("test"), name, loopNumber-1);
     }
   });
   const results = await Promise.all(readPromises);
   const readOutputs = results.map(({ readOutput }) => readOutput).join(' ');
   console.log(`${timestamp} Write ${writeOutput} Read ${readOutputs}`);

 }
}

main();

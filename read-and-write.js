 /*
     Environment variables:
      - w: write concern level (default: majority)
 */

 // this will be read in order (I think) so place the multi-host first if you want to use it for writes
 // the host names take the project name (in .env) and the service name (in docker-compose.yaml) and the replica number
 const connections = {
   "mongo*": 'mongodb://rs-mongo-1:27017,rs-mongo-2:27017,rs-mongo-3:27017/test?replicaSet=rs0&readPreference=secondaryPreferred',
   "mongo1": 'mongodb://rs-mongo-1:27017/test',
   "mongo2": 'mongodb://rs-mongo-2:27017/test',
   "mongo3": 'mongodb://rs-mongo-3:27017/test',
 };

const readConcern =  process.env.r || 'local' // Default to 'local' if not defined
const writeConcern = { w: process.env.w || 'majority' }; // Default to 'majority' if not defined


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
      print(`\nError checking primary status on ${name}: ${error}`);
    }
  }
  return null;
}

function performRead(db, nodeName, expectedValue) {
  const collection = db.getCollection("testCollection");
  const readStart = Date.now();
  try {
    const document = collection.find({ key: 'one' }).readConcern(readConcern).limit(1).next();
    const readEnd = Date.now();
    const readDuration = readEnd - readStart;
    const readValue = document ? document.value : '';
    const readOutput = `${expectedValue>=readValue?"✅":"🚫"} ${padLeft(nodeName + '= ', 6)}${padLeft(readValue.toString(), 3)} (${padLeft(readDuration.toString(),5)}ms)`;
    return { readOutput, document };
  } catch (error) {
    const readEnd = Date.now();
    const readDuration = readEnd - readStart;
    print(`\nError in read operation from ${nodeName}: ${error} (${padLeft(readDuration.toString(),5)}ms)`);
    return { readOutput: padLeft(`(${0}ms) ${nodeName}: error`, 30), document: null };
  }
}

async function main() {

  print(`Environment variables: (w: ${writeConcern.w} r: ${readConcern})`);
  const dbs = Object.entries(connections).reduce((acc, [name, uri]) => {
    const connectStart = Date.now();
    try {
      const mongo = new Mongo(uri);
      acc[name] = mongo;
      const connectEnd = Date.now();
      const connectDuration = connectEnd - connectStart;
      const role = mongo.getDB('admin').runCommand({ isMaster: 1 }).ismaster ? 'primary  ' : 'secondary';
      print(`Connected to ${name} (${padLeft(connectDuration.toString(),5)}ms) where ${role} is available`);
    } catch (e) {
      const connectEnd = Date.now();
      const connectDuration = connectEnd - connectStart;
      print(`\nCould not connect to ${name} (${padLeft(connectDuration.toString(),5)}ms): ${e}`);
    }
    return acc;
  }, {});

  let loopNumber = 0;
    // gets the connection strin where a primary is available
    const primaryNode = findPrimary(dbs);
  while (true) {
    loopNumber++;
    const timestamp = (new Date()).toISOString();

    let writeOutput = '';
    if (primaryNode) {
      const writeStart = Date.now();
      const primaryDb = dbs[primaryNode].getDB("test");
      try {
        const collection = primaryDb.getCollection("testCollection");
        const updateResult = collection.updateOne(
              { key: 'one' },
              { $set: { value: loopNumber } },
              { upsert: true , writeConcern }
            );
        const writeEnd = Date.now();
        const writeDuration = writeEnd - writeStart;
        writeOutput = `${primaryNode} {"key":"one","value":${padLeft(loopNumber.toString(),3)}} (${padLeft(writeDuration.toString(),5)}ms)`;
      } catch (error) {
        const writeEnd = Date.now();
        const writeDuration = writeEnd - writeStart;
        writeOutput = `primary: ${primaryNode} write error`;
        print(`\nError in write operation on ${primaryNode}: ${error} (${padLeft(writeDuration.toString(),5)}ms)`);
      }
    } else {
      writeOutput = '\nwrite error: no primary';
    }

    const readPromises = Object.entries(dbs).map(async ([name, db]) => {
      if (!db) {
        return { readOutput: padLeft(`(${0}ms) ${name}: error`, 30), document: null };
      }
      return performRead(db.getDB("test"), name, loopNumber);
    });
    const results = await Promise.all(readPromises);
    const readOutputs = results.map(({ readOutput }) => readOutput).join(' ');
    print(`${timestamp} Write to: ${writeOutput} Read from: ${readOutputs}`);

  }
}

main();

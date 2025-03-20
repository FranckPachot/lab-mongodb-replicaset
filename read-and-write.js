 /*
     Environment variables:
      - w: write concern level (default: majority)
 */

 const connections = {
   mongo1: 'mongodb://mongo1:27017/test',
   mongo2: 'mongodb://mongo2:27017/test',
   mongo3: 'mongodb://mongo3:27017/test',
 };

const readConcern =  process.env.r || 'local' // Default to 'local' if not defined
const writeConcern = { w: process.env.w || 'majority' }; // Default to 'majority' if not defined

let loopNumber = 0;

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
      print(`Error checking primary status on ${name}: ${error}`);
    }
  }
  return null;
}

function performRead(db, nodeName, expectedValue) {
  const collection = db.getCollection("testCollection");
  try {
    const readStart = Date.now();
    const document = collection.find({ key: 'one' }).readConcern(readConcern).limit(1).next();
    const readEnd = Date.now();
    const readDuration = readEnd - readStart;
    const readValue = document ? document.value : '';
    const readOutput = `${expectedValue==readValue?"✅":"🚫"} ${padLeft(nodeName + ': ', 6)}${padLeft(readValue.toString(), 3)} (${padLeft(readDuration.toString(),5)}ms)`;
    return { readOutput, document };
  } catch (error) {
    print(`Error in operations on ${nodeName}: ${error}`);
    return { readOutput: padLeft(`(${0}ms) ${nodeName}: error`, 30), document: null };
  }
}

function main() {

  const dbs = Object.entries(connections).reduce((acc, [name, uri]) => {
    const connectStart = Date.now();
    try {
      const mongo = new Mongo(uri);
      acc[name] = mongo;
      const connectEnd = Date.now();
      const connectDuration = connectEnd - connectStart;
      const role = mongo.getDB('admin').runCommand({ isMaster: 1 }).ismaster ? 'primary  ' : 'secondary';
      print(`Connected to ${name} (${padLeft(connectDuration.toString(),5)}ms) as ${role} (w: ${writeConcern.w} r: ${readConcern})`);
    } catch (e) {
      const connectEnd = Date.now();
      const connectDuration = connectEnd - connectStart;
      print(`Could not connect to ${name} (${padLeft(connectDuration.toString(),5)}ms): ${e}`);
    }
    return acc;
  }, {});

  while (true) {
    loopNumber++;
    const timestamp = (new Date()).toISOString();

    const primaryNode = findPrimary(dbs);
    let writeOutput = '';
    if (primaryNode) {
      const primaryDb = dbs[primaryNode].getDB("test");
      try {
        const writeStart = Date.now();
        const collection = primaryDb.getCollection("testCollection");
        const updateResult = collection.updateOne(
              { key: 'one' },
              { $set: { value: loopNumber } },
              { upsert: true , writeConcern }
            );
        const writeEnd = Date.now();
        const writeDuration = writeEnd - writeStart;
        writeOutput = `write to primary: ${primaryNode} {"key":"one","value":${padLeft(loopNumber.toString(),3)}} (${padLeft(writeDuration.toString(),5)}ms)`;
      } catch (error) {
        writeOutput = `primary: ${primaryNode} write error`;
        print(`Error in write operation on ${primaryNode}: ${error}`);
      }
    } else {
      writeOutput = 'write error: no primary';
    }

    const readPromises = Object.entries(dbs).map(async ([name, db]) => {
      if (!db) {
        return { readOutput: padLeft(`(${0}ms) ${name}: error`, 30), document: null };
      }
      return performRead(db.getDB("test"), name, loopNumber);
    });

    Promise.all(readPromises).then((results) => {
      const readOutputs = results.map(({ readOutput }) => readOutput).join(' ');
      print(`${timestamp} ${writeOutput} ${readOutputs}`);
    });

  }
}

main();

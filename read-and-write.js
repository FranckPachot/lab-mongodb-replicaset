let loopNumber = 0;

// Default Read Concern: "local"
const readConcernLevel = "local";

// Default Write Concern: w = 1
const writeConcern = { w: 1 };

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

function performOperations(db, nodeName) {
  const collection = db.getCollection("testCollection");
  
  try {
    const readStart = Date.now();
    const document = collection.findOne({ key: 'one' }, { readConcern: { level: readConcernLevel } });
    const readEnd = Date.now();
    const readDuration = readEnd - readStart;
    const readValue = document ? document.value : '';
    const readOutput = `${padLeft(`(${readDuration}ms) ${nodeName}: ${readValue}`, 30)}`;
    return { readOutput, document };
  } catch (error) {
    print(`Error in operations on ${nodeName}: ${error}`);
    return { readOutput: padLeft(`(${0}ms) ${nodeName}: error`, 30), document: null };
  }
}

function main() {
  const connections = {
    mongo1: 'mongodb://mongo1:27017/test',
    mongo2: 'mongodb://mongo2:27017/test',
    mongo3: 'mongodb://mongo3:27017/test',
  };

  const dbs = Object.entries(connections).reduce((acc, [name, uri]) => {
    const connectStart = Date.now();
    try {
      const mongo = new Mongo(uri);
      acc[name] = mongo;
      const connectEnd = Date.now();
      const connectDuration = connectEnd - connectStart;
      print(`Connected to ${name} (${connectDuration}ms)`);
    } catch (e) {
      const connectEnd = Date.now();
      const connectDuration = connectEnd - connectStart;
      print(`Could not connect to ${name} (${connectDuration}ms): ${e}`);
    }
    return acc;
  }, {});

  while (true) {
    loopNumber++;
    const timestamp = (new Date()).toISOString();
    const results = Object.entries(dbs).map(([name, db]) => {
      if (!db) {
        return { readOutput: padLeft(`(${0}ms) ${name}: error`, 30), document: null };
      }
      return performOperations(db.getDB("test"), name);
    });

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
          { upsert: true, writeConcern }
        );
        const writeEnd = Date.now();
        const writeDuration = writeEnd - writeStart;
        writeOutput = `primary: ${primaryNode} write {"key":"one","value":${loopNumber}} (${writeDuration}ms)`;
      } catch (error) {
        writeOutput = `primary: ${primaryNode} write error`;
        print(`Error in write operation on ${primaryNode}: ${error}`);
      }
    } else {
      writeOutput = 'write error: no primary';
    }

    const readOutputs = results.map(({ readOutput }) => readOutput).join(' ');
    print(`${timestamp} ${readOutputs} ${writeOutput}`);

    sleep(5000);  // Sleep for 5 seconds
  }
}

main();


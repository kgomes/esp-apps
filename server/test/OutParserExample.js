// Import the parsing module which we are testing here
const outParser = require('../OutParser')

// Set the logging directory
outParser.setLogDirectory('/Users/kgomes/Documents/workspace/esp-apps/server/test');
outParser.setLogLevel('off');

function parseFile(file) {
    outParser.parseFile(file, function (err, parsedObject) {
        var protocolRuns = parsedObject.protocolRuns;
        var images = parsedObject.images;
        var errors = parsedObject.errors;
        var ancillaryData = parsedObject.ancillaryData;
        console.log(file + ': ' + Object.keys(parsedObject['protocolRuns']).length + ' protocol runs');
        console.log(file + ': ' + Object.keys(parsedObject['samples']).length + ' samples');
        console.log(file + ': ' + Object.keys(parsedObject['images']).length + ' images');
        console.log(file + ': ' + Object.keys(parsedObject['errors']).length + ' errors');
        console.log(file + ': ' + Object.keys(parsedObject['ancillaryData']['Can']).length + ' Can data entries');
        console.log(file + ': ' + Object.keys(parsedObject['ancillaryData']['CTD']).length + ' CTD data entries');
        console.log('Done parsing');
    });
}

parseFile('/Users/kgomes/Documents/workspace/esp-apps/server/test/logs/bruce-2013-real.out');
parseFile('/Users/kgomes/Documents/workspace/esp-apps/server/test/logs/bruce-2013-real-full.out');
parseFile('/Users/kgomes/Documents/workspace/esp-apps/server/test/logs/moe-mars-2013-real.out');
parseFile('/Users/kgomes/Documents/workspace/esp-apps/server/test/logs/moe-mars-2013-real-full.out');
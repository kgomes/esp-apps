// Import the parsing module which we are testing here
const outParser = require('../OutParser')

// Set the logging directory
outParser.setLogDirectory('/Users/kgomes/Documents/workspace/esp-apps/server/test');

// Read in the 2013 Bruce real.out file and parse it
test('Bruce 2013 real.out should have 8758 Can data points', done => {
    // Create a callback function that will run the tests
    function callback(parsedObject, err) {
        // Should be 8758 Can data points
        expect(Object.keys(parsedObject['ancillaryData']['Can']).length).toBe(8758);

        // Declare that the test is done
        done();
    }
    outParser.parseFile('/Users/kgomes/Documents/workspace/esp-apps/server/test/logs/bruce-2013-real.out', callback);
});

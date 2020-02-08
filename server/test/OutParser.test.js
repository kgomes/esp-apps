// Import the parsing module which we are testing here
const outParser = require('../OutParser')

jest.setTimeout(60000);

// Turn off logging
outParser.setLogLevel("OFF");

// Read in the 2013 Bruce real.out file and parse it
test('Test parsing of Bruce 2013 real.out', done => {
    // Create a callback function that will run the tests
    function callback(err, parsedObject) {
        // Should be 8758 Can data points
        expect(Object.keys(parsedObject['ancillaryData']['Can']).length).toBe(8741);
        expect(Object.keys(parsedObject['ancillaryData']['CTD']).length).toBe(8720);
        expect(Object.keys(parsedObject['errors']).length).toBe(13);
        expect(Object.keys(parsedObject['images']).length).toBe(136);
        expect(Object.keys(parsedObject['protocolRuns']).length).toBe(37);
        expect(Object.keys(parsedObject['samples']).length).toBe(37);

        // Declare that the test is done
        done();
    }
    outParser.parseFile('/Users/kgomes/Documents/workspace/esp-apps/server/test/logs/bruce-2013-real.out', callback);
});

test('Test parsing of Bruce 2013 FULL real.out', done => {
    // Create a callback function that will run the tests
    function callback(err, parsedObject) {
        // Should be 8758 Can data points
        expect(Object.keys(parsedObject['ancillaryData']['Can']).length).toBe(8752);
        expect(Object.keys(parsedObject['ancillaryData']['CTD']).length).toBe(8731);
        expect(Object.keys(parsedObject['errors']).length).toBe(15);
        expect(Object.keys(parsedObject['images']).length).toBe(136);
        expect(Object.keys(parsedObject['protocolRuns']).length).toBe(37);
        expect(Object.keys(parsedObject['samples']).length).toBe(37);

        // Declare that the test is done
        done();
    }
    outParser.parseFile('/Users/kgomes/Documents/workspace/esp-apps/server/test/logs/bruce-2013-real-full.out', callback);
});

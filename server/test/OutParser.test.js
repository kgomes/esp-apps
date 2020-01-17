const outParser = require('../OutParser')

outParser.parseFile('/Users/kgomes/Documents/workspace/esp-apps/server/test/waldo-real.out', function (parsedObject, err) {
    if (err) {
        console.log('Error');
        console.log(err);
    } else {
        console.log(parsedObject);
    }

});

outParser.parseFile('/Users/kgomes/Documents/workspace/esp-apps/server/test/moe-real.out', function (parsedObject, err) {
    if (err) {
        console.log('Error');
        console.log(err);
    } else {
        console.log(parsedObject);
    }

});

// Ancillary lookup object
var ancillaryDataLookup = {
    'CTD': {
        'C': {
            'varName': 'Temp',
            'varLongName': 'Temperature',
            'units': 'Degrees C'
        },
        'm': {
            'varName': 'Depth',
            'varLongName': 'Depth',
            'units': 'meters'
        },
        'psu': {
            'varName': 'Sal',
            'varLongName': 'Salinity',
            'units': 'psu'
        },
        'mg/m^3': {
            'varName': 'Chl',
            'varLongName': 'Chlorophyll',
            'units': 'mg/m^3'
        },
        '%': {
            'varName': 'Light Tx',
            'varLongName': 'Light Transmission',
            'units': '%'
        },
        'ml/L': {
            'varName': 'Diss O2',
            'varLongName': 'Computed Dissolved Oxygen',
            'units': 'ml/L'
        },
        'decibars': {
            'varName': 'Press',
            'varLongName': 'Pressure',
            'units': 'decibars'
        },
        'S/m': {
            'varName': 'Cond',
            'varLongName': 'Conductivity',
            'units': 'S/m'
        }
    },
    'Can': {
        'C': {
            'varName': 'Temp',
            'varLongName': 'Temperature',
            'units': 'Degrees C'
        },
        '% Wet!': {
            'varName': '% Wet!',
            'varLongName': 'Percent Wet',
            'units': '%'
        },
        '% humidity': {
            'varName': '% Humidity',
            'varLongName': 'Percent Humidity',
            'units': '%'
        },
        'psia': {
            'varName': 'Press',
            'varLongName': 'Pressure',
            'units': 'psia'
        },
        'V': {
            'varName': 'Volt',
            'varLongName': 'Battery Voltage',
            'units': 'V'
        },
        'A': {
            'varName': 'Inst Curr',
            'varLongName': 'Instantaneous Current',
            'units': 'A'
        },
        'A avg': {
            'varName': 'Avg Curr',
            'varLongName': 'Average Current',
            'units': 'A'
        },
        'W': {
            'varName': 'Power',
            'varLongName': 'Power',
            'units': 'W'
        },
        '% flow': {
            'varName': '% Flow',
            'varLongName': 'Percent Flow',
            'units': '%'
        }
    },
    'ISUS': {
        'uM/L no^3': {
            'varName': 'Nitrate',
            'varLongName': 'Nitrate',
            'units': 'uM/L no^3'
        },
        'uM/L no3': {
            'varName': 'Nitrate',
            'varLongName': 'Nitrate',
            'units': 'uM/L no3'
        },
        'uM no^3': {
            'varName': 'Nitrate',
            'varLongName': 'Nitrate',
            'units': 'uM no^3'
        },
        'uM no3': {
            'varName': 'Nitrate',
            'varLongName': 'Nitrate',
            'units': 'uM no3'
        },
        'uM/L hs': {
            'varName': 'Nitrate 2',
            'varLongName': 'Nitrate 2',
            'units': 'uM/L hs'
        },
        'uM hs': {
            'varName': 'Nitrate 2',
            'varLongName': 'Nitrate 2',
            'units': 'uM hs'
        },
        'psu': {
            'varName': 'PSU',
            'varLongName': 'PSU',
            'units': 'psu'
        }
    },
    'SatlanticISUS': {
        'uM/L': {
            'varName': 'Nitrate',
            'varLongName': 'Nitrate',
            'units': 'uM/L'
        },
        'psu': {
            'varName': 'PSU',
            'varLongName': 'PSU',
            'units': 'psu'
        }
    },
    'SUNA': {
        'uM': {
            'varName': 'Nitrate',
            'varLongName': 'Nitrate',
            'units': 'uM'
        },
        'psu': {
            'varName': 'Salinity',
            'varLongName': 'Salinity',
            'units': ''
        }
    }
}


// Import the parsing module which we are testing here
const outParser = require('../OutParser')

// Set the ancillary lookup
outParser.setAncillaryDataLookup(ancillaryDataLookup);

// And the merge utility
const deploymentUtils = require('../DeploymentUtils');

// Set up logging
outParser.setLogDirectory('/Users/kgomes/Documents/workspace/esp/esp-apps/server/test');
deploymentUtils.setLogDirectory('/Users/kgomes/Documents/workspace/esp/esp-apps/server/test');
outParser.setLogLevel('off');
deploymentUtils.setLogLevel('off');

// Parse a .out file
var parsedObject = outParser.parseFileSync('/Users/kgomes/Documents/workspace/esp/esp-apps/server/test/logs/bruce-2013-real.out');
console.log(parsedObject['name']);
console.log(JSON.stringify(parsedObject['ancillaryData'], null, 2));
console.log(Object.keys(parsedObject['ancillaryDataPoints']).length);
console.log(Object.keys(parsedObject['ancillaryDataPoints']['Can']).length);
console.log(Object.keys(parsedObject['ancillaryDataPoints']['CTD']).length);

// Make a copy of it
var copyOfParsedObject = JSON.parse(JSON.stringify(parsedObject));

// Make some changes to the copy
parsedObject['notifySlack'] = true;
parsedObject['slackChannel'] = '#esp-testy';
parsedObject['name'] = 'Test Deployment';
parsedObject['description'] = 'Test description';
parsedObject['startDate'] = '2020-01-01T00:00:00PDT';
parsedObject['endDate'] = '2020-02-01T00:00:00PDT';
parsedObject['esp'] = {
    'name': 'Bruce2',
    'ftpHost': 'espshore.mbari.org',
    'ftpPort': 21,
    'ftpUsername': 'anonymous',
    'ftpPassword': 'kgomes@mbari.org',
    'ftpWorkingDir': '/bruce2',
    'mode': 'real'
}

// Merge the two
var mergeMessages = deploymentUtils.mergeDeployments(parsedObject, copyOfParsedObject);
console.log(JSON.stringify(mergeMessages, null, 2));

//parseFile('/Users/kgomes/Documents/workspace/esp/esp-apps/server/test/logs/bruce-2013-real-full.out');
//parseFile('/Users/kgomes/Documents/workspace/esp/esp-apps/server/test/logs/moe-mars-2013-real.out');
//parseFile('/Users/kgomes/Documents/workspace/esp/esp-apps/server/test/logs/moe-mars-2013-real-full.out');
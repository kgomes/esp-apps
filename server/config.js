// Grab the path library to help with directory paths
var path = require('path');

// Now export the configuration object
module.exports = {

    // This is the location where the data for all the ESPs will be stored
    dataDir: '/Users/kgomes/Documents/Web/esp/services/espweb/data',

    // Options for the server
    serverOptions: {
        ftpSyncIntervalMillis: 60000,
        loggerLevel: 'info'
    },

    // Application server options
    appServerOptions: {
        hostBaseUrl:'http://localhost',
        port: 8081,
        loggerLevel: 'debug',
        // The UserRouter options
        userRouterOptions: {
            loggerLevel: 'info'
        },
        // The ESPRouter options
        espRouterOptions: {
            loggerLevel: 'info'
        },
        // The DeploymentRouter options
        deploymentRouterOptions: {
            loggerLevel: 'info'
        },
        // The AncillaryDataRouter options
        ancillaryDataRouterOptions: {
            loggerLevel: 'info'
        }
    },


    // Datastore connection options
    dataStoreOptions: {
        couchHost: 'localhost',
        couchPort: 5984,
        couchSSL: false,
        couchUsername: 'espdba',
        couchPassword: 'leghorn',
        couchDatabase: 'esp',
        pgProtocol: 'postgres',
        pgHost: 'localhost',
        pgPort: 5432,
        pgUsername: 'espdba',
        pgPassword: 'leghorn',
        pgDatabase: 'esp_ancillary',
        loggerLevel: 'info',
        numAncillaryPointsToBatch: 1000
    },

    // The options for the FTPSync class
    ftpSyncOptions: {
        loggerLevel: 'info'
    },

    // The LogParser options
    logParserOptions: {
        loggerLevel: 'info',
        useAncillaryTimestamps: true,
        numberOfTicksPerSecond: 100,
        tempDir: '/tmp',
        // The timezone lookup table
        timezoneLookup: {
            'EDT': {
                stringRep: '-0400',
                hourOffset: -4
            },
            'GMT': {
                stringRep: '0000',
                hourOffset: 0
            },
            'PDT': {
                stringRep: '-0700',
                hourOffset: -7
            },
            'PST': {
                stringRep: '-0800',
                hourOffset: -8
            },
            'UTC': {
                stringRep: '0000',
                hourOffset: 0
            }
        },
        // The ancillary data lookup table
        ancillaryLookup: {
            CTD: {
                'C': {
                    'var_name': 'Temp',
                    'var_long_name': 'Temperature',
                    'units': 'Degrees C'
                },
                'm': {
                    'var_name': 'Depth',
                    'var_long_name': 'Depth',
                    'units': 'meters'
                },
                'psu': {
                    'var_name': 'Sal',
                    'var_long_name': 'Salinity',
                    'units': 'psu'
                },
                'mg/m^3': {
                    'var_name': 'Chl',
                    'var_long_name': 'Chlorophyll',
                    'units': 'mg/m^3'
                },
                '%': {
                    'var_name': 'Light Tx',
                    'var_long_name': 'Light Transmission',
                    'units': '%'
                },
                'ml/L': {
                    'var_name': 'Diss O2',
                    'var_long_name': 'Computed Dissolved Oxygen',
                    'units': 'ml/L'
                }
            },
            Can: {
                'C': {
                    'var_name': 'Temp',
                    'var_long_name': 'Temperature',
                    'units': 'Degrees C'
                },
                '% humidity': {
                    'var_name': '% Humidity',
                    'var_long_name': 'Percent Humidity',
                    'units': '%'
                },
                'psia': {
                    'var_name': 'Press',
                    'var_long_name': 'Pressure',
                    'units': 'psia'
                },
                'V': {
                    'var_name': 'Volt',
                    'var_long_name': 'Battery Voltage',
                    'units': 'V'
                },
                'A': {
                    'var_name': 'Inst Curr',
                    'var_long_name': 'Instantaneous Current',
                    'units': 'A'
                },
                'A avg': {
                    'var_name': 'Avg Curr',
                    'var_long_name': 'Average Current',
                    'units': 'A'
                },
                'W': {
                    'var_name': 'Power',
                    'var_long_name': 'Power',
                    'units': 'W'
                }
            },
            ISUS: {
                'uM/L no^3': {
                    'var_name': 'Nitrate',
                    'var_long_name': 'Nitrate',
                    'units': 'uM/L no^3'
                },
                'uM/L hs': {
                    'var_name': 'Nitrate 2',
                    'var_long_name': 'Nitrate 2',
                    'units': 'uM/L hs'
                },
                'psu': {
                    'var_name': 'PSU',
                    'var_long_name': 'PSU',
                    'units': 'psu'
                }
            }
        }
    },

    // The EventHandler options
    eventHandlerOptions: {
        loggerLevel: 'info'
    }
};